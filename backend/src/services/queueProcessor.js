const { supabase } = require('../config/supabase');
const whatsappService = require('./whatsappService');
const { sendTemplateMessage } = whatsappService;
const pLimit = require('p-limit').default || require('p-limit');
const HttpsAgent = require('agentkeepalive').HttpsAgent;

// HTTP Keep-Alive agent for optimal connection reuse
const keepaliveAgent = new HttpsAgent({
  maxSockets: 200,           // Increased for higher concurrency
  maxFreeSockets: 50,         // More idle connections
  timeout: 60000,            // Active socket timeout (60s)
  freeSocketTimeout: 30000,  // Idle socket timeout (30s)
  socketActiveTTL: 120000    // Increased socket lifetime (120s)
});

// Initialize the HTTP agent in whatsappService
whatsappService.setHttpAgent(keepaliveAgent);

// Export agent for use in whatsappService
module.exports.keepaliveAgent = keepaliveAgent;

/**
 * High-Performance Queue Processor for Campaign Messages
 * Optimized for sustained high-speed messaging (80-1000 msg/sec)
 */

// In-memory state for rate control (per WhatsApp number)
const rateControlState = new Map();

// In-memory counter cache for batched updates (per campaign)
const counterCache = new Map();

// Performance metrics tracking
const performanceMetrics = new Map();

/**
 * Initialize performance metrics for a campaign
 */
function initPerformanceMetrics(campaignId) {
  if (!performanceMetrics.has(campaignId)) {
    performanceMetrics.set(campaignId, {
      startTime: Date.now(),
      totalSent: 0,
      totalFailed: 0,
      lastBatchTime: Date.now(),
      avgBatchTime: 0,
      batchCount: 0
    });
  }
  return performanceMetrics.get(campaignId);
}

/**
 * Initialize counter cache for a campaign
 */
function initCounterCache(campaignId) {
  if (!counterCache.has(campaignId)) {
    counterCache.set(campaignId, {
      pendingSent: 0,
      pendingFailed: 0,
      batchesSinceLastUpdate: 0,
      lastUpdateTime: Date.now()
    });
  }
  return counterCache.get(campaignId);
}

/**
 * Flush counter cache to database
 * Called when: 30 seconds elapsed OR 10 batches completed OR campaign ends
 */
async function flushCounterCache(campaignId, force = false) {
  const cache = counterCache.get(campaignId);
  if (!cache) return;

  const timeSinceLastUpdate = Date.now() - cache.lastUpdateTime;
  const shouldFlush = force ||
                      timeSinceLastUpdate >= 30000 || // 30 seconds (reduced from 60)
                      cache.batchesSinceLastUpdate >= 10; // 10 batches

  if (shouldFlush) {
    // CRITICAL FIX: Calculate accurate counts directly from send_queue
    // This ensures we count unique contacts, not duplicate send attempts
    const { data: queueStats, error: statsError } = await supabase
      .from('send_queue')
      .select('status')
      .eq('campaign_id', campaignId);

    if (statsError) {
      console.error(`[Queue] Error fetching queue stats:`, statsError);
      return;
    }

    // Count by status
    const sentCount = queueStats.filter(q => q.status === 'sent').length;
    const failedCount = queueStats.filter(q => q.status === 'failed').length;

    // Calculate delivered/read/replied stats for realtime updates
    const [deliveredResult, readResult, repliedResult] = await Promise.all([
      // Count delivered (status = 'delivered' OR 'read')
      supabase
        .from('message_status_logs')
        .select('whatsapp_message_id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['delivered', 'read']),

      // Count read (status = 'read')
      supabase
        .from('message_status_logs')
        .select('whatsapp_message_id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'read'),

      // Count replied (unique users who sent incoming messages)
      supabase.rpc('count_campaign_replies', { p_campaign_id: campaignId })
    ]);

    const deliveredCount = deliveredResult.count || 0;
    const readCount = readResult.count || 0;
    let repliedCount = 0;

    // Handle RPC result (may not exist in older databases)
    if (!repliedResult.error && repliedResult.data !== null) {
      repliedCount = repliedResult.data;
    }

    console.log(`[Queue] Flushing accurate counters: ${sentCount} sent, ${failedCount} failed, ${deliveredCount} delivered, ${readCount} read, ${repliedCount} replied`);

    // Update campaign with accurate counts
    await supabase
      .from('campaigns')
      .update({
        total_sent: sentCount,
        total_failed: failedCount,
        total_delivered: deliveredCount,
        total_read: readCount,
        total_replied: repliedCount
      })
      .eq('id', campaignId);

    // Reset cache
    cache.pendingSent = 0;
    cache.pendingFailed = 0;
    cache.batchesSinceLastUpdate = 0;
    cache.lastUpdateTime = Date.now();
  }
}

/**
 * Initialize rate control for a WhatsApp number
 */
function initRateControl(whatsappNumberId, initialRate) {
  if (!rateControlState.has(whatsappNumberId)) {
    rateControlState.set(whatsappNumberId, {
      currentRate: initialRate || 80, // Start at 80 msg/sec (WhatsApp default)
      errorCount: 0,
      consecutiveErrorCount: 0,
      lastErrorTime: null,
      successWindow: [], // Track last 5 minutes of successes
      errorWindow: [],   // Track last 5 minutes of errors
      isProcessing: false,
      lastUpdateTime: Date.now(),
      totalMessagesSent: 0,
      lastRateIncrease: Date.now()
    });
  }
  return rateControlState.get(whatsappNumberId);
}

/**
 * Calculate current throughput
 */
function calculateThroughput(rateState) {
  const now = Date.now();
  const windowSize = 60000; // 1 minute window

  // Clean old entries
  rateState.successWindow = rateState.successWindow.filter(t => now - t <= windowSize);

  // Calculate messages per second in the last minute
  const messagesInWindow = rateState.successWindow.length;
  const actualRate = messagesInWindow / 60;

  return actualRate;
}

/**
 * Adjust rate based on error/success patterns - More aggressive scaling
 */
async function adjustRate(whatsappNumberId, rateState, errorCode = null, maxLimit = 1000) {
  const now = Date.now();

  if (errorCode === 130429 || errorCode === 80007) {
    // WhatsApp rate limit errors
    rateState.consecutiveErrorCount++;
    rateState.errorWindow.push(now);

    if (rateState.consecutiveErrorCount >= 2) { // Reduced from 3 for faster response
      // Decrease rate by 30% after 2 consecutive rate limit errors
      const newRate = Math.max(10, Math.floor(rateState.currentRate * 0.7));
      console.log(`[Rate Control] Rate limit hit! Decreasing rate for ${whatsappNumberId}: ${rateState.currentRate} -> ${newRate} msg/sec`);

      rateState.currentRate = newRate;
      rateState.consecutiveErrorCount = 0;
      rateState.lastRateIncrease = now; // Reset increase timer

      // Persist to database
      await supabase
        .from('whatsapp_numbers')
        .update({
          max_send_rate_per_sec: newRate,
          last_updated: new Date().toISOString()
        })
        .eq('id', whatsappNumberId);
    }
  } else if (errorCode === null) {
    // Success
    rateState.consecutiveErrorCount = 0;
    rateState.successWindow.push(now);
    rateState.totalMessagesSent++;

    // Keep only last 5 minutes of data
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    rateState.successWindow = rateState.successWindow.filter(t => t > fiveMinutesAgo);
    rateState.errorWindow = rateState.errorWindow.filter(t => t > fiveMinutesAgo);

    // Calculate error rate
    const totalRecent = rateState.successWindow.length + rateState.errorWindow.length;
    const errorRate = totalRecent > 0 ? rateState.errorWindow.length / totalRecent : 0;

    // More aggressive rate increase - 25% if error rate < 1% for 30 seconds
    // And we haven't increased in the last 30 seconds
    const timeSinceLastIncrease = now - rateState.lastRateIncrease;

    if (errorRate < 0.01 &&
        totalRecent >= 30 &&
        timeSinceLastIncrease >= 30000 &&
        rateState.currentRate < maxLimit) {

      const currentThroughput = calculateThroughput(rateState);

      // Only increase if we're actually achieving close to our target rate
      if (currentThroughput >= rateState.currentRate * 0.8) {
        const newRate = Math.min(maxLimit, Math.floor(rateState.currentRate * 1.25));
        console.log(`[Rate Control] Excellent performance! Increasing rate for ${whatsappNumberId}: ${rateState.currentRate} -> ${newRate} msg/sec (actual: ${currentThroughput.toFixed(1)} msg/sec)`);

        rateState.currentRate = newRate;
        rateState.lastUpdateTime = now;
        rateState.lastRateIncrease = now;

        // Persist to database
        await supabase
          .from('whatsapp_numbers')
          .update({
            max_send_rate_per_sec: newRate,
            last_stable_rate_per_sec: newRate,
            last_updated: new Date().toISOString()
          })
          .eq('id', whatsappNumberId);
      }
    }
  } else {
    // Other error types
    rateState.errorCount++;
    rateState.errorWindow.push(now);
  }
}

/**
 * Handle automatic campaign pause due to spam detection (error 131048)
 */
async function handleSpamAutoPause(campaignId, whatsappNumberId) {
  try {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('spam_pause_count, name')
      .eq('id', campaignId)
      .single();

    if (!campaign) return;

    const currentPauseCount = campaign.spam_pause_count || 0;
    const newPauseCount = currentPauseCount + 1;

    console.log(`[Queue] 🚨 SPAM AUTO-PAUSE TRIGGERED for campaign "${campaign.name}" (occurrence #${newPauseCount})`);

    if (newPauseCount === 1) {
      // First occurrence: Pause for 30 minutes
      const pausedUntil = new Date(Date.now() + 30 * 60 * 1000);

      await flushCounterCache(campaignId, true);

      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          spam_pause_count: newPauseCount,
          spam_paused_until: pausedUntil.toISOString(),
          pause_reason: `Spam filter detected. Auto-resuming at 50% speed at ${pausedUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.`
        })
        .eq('id', campaignId);

      // Reduce rate by 50%
      const { data: whatsappNumber } = await supabase
        .from('whatsapp_numbers')
        .select('max_send_rate_per_sec')
        .eq('id', whatsappNumberId)
        .single();

      const currentRate = whatsappNumber?.max_send_rate_per_sec || 100;
      const newRate = Math.max(10, Math.floor(currentRate * 0.5));

      await supabase
        .from('whatsapp_numbers')
        .update({ max_send_rate_per_sec: newRate })
        .eq('id', whatsappNumberId);

      console.log(`[Queue] Campaign paused for 30 minutes, rate reduced to ${newRate} msg/sec`);

    } else {
      // Second+ occurrence: Permanent pause
      await flushCounterCache(campaignId, true);

      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          spam_pause_count: newPauseCount,
          spam_paused_until: null,
          pause_reason: `Spam filter detected again. Manual resume required.`
        })
        .eq('id', campaignId);

      console.log(`[Queue] Campaign PERMANENTLY PAUSED - manual intervention required`);
    }

  } catch (error) {
    console.error(`[Queue] Error in handleSpamAutoPause:`, error);
  }
}

/**
 * Process campaign queue with high-performance batching
 */
async function processCampaignQueue(campaignId) {
  let campaign = null;
  let rateState = null; // Declare at function scope

  try {
    // Get campaign details
    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    campaign = campaignData;

    if (campaignError || !campaign) {
      console.error(`[Queue] Campaign ${campaignId} not found`);
      return;
    }

    if (campaign.status !== 'running') {
      console.log(`[Queue] Campaign ${campaignId} is not running (status: ${campaign.status})`);
      return;
    }

    // Get WhatsApp number details
    const { data: whatsappNumber, error: numberError } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('id', campaign.whatsapp_number_id)
      .single();

    if (numberError || !whatsappNumber || !whatsappNumber.is_active) {
      console.error(`[Queue] WhatsApp number issue for campaign ${campaignId}`);
      if (!whatsappNumber?.is_active) {
        await supabase
          .from('campaigns')
          .update({ status: 'failed', end_time: new Date().toISOString() })
          .eq('id', campaignId);
      }
      return;
    }

    // Initialize rate control with higher default
    const maxLimit = whatsappNumber.max_limit || 1000;
    const initialRate = Math.min(maxLimit, whatsappNumber.max_send_rate_per_sec || 80);
    rateState = initRateControl(whatsappNumber.id, initialRate); // Now properly initialized

    // Note: isProcessing flag is already set by the caller (processQueue)
    // We just need to ensure rateState reference is stored for cleanup

    // Initialize metrics
    const metrics = initPerformanceMetrics(campaignId);
    const cache = initCounterCache(campaignId);

    // Pre-fetch all templates for caching
    const cacheKey = `${campaign.whatsapp_number_id}_templates`;
    let templateMap = {};

    const { data: templates } = await supabase
      .from('templates')
      .select('name, components, language')
      .eq('whatsapp_number_id', campaign.whatsapp_number_id)
      .in('name', campaign.template_names || []);

    if (templates) {
      templates.forEach(t => {
        templateMap[t.name] = { components: t.components, language: t.language };
      });
      console.log(`[Queue] Loaded ${templates.length} templates for campaign ${campaignId}`);
    }

    // MAIN PROCESSING LOOP - Continuous processing until campaign complete
    let consecutiveEmptyBatches = 0;
    const BATCH_SIZE = 40; // Increased batch size for better throughput
    const MAX_CONCURRENT = 5; // Moderate concurrency
    // Dynamic delay based on adaptive rate - will be calculated per batch

    while (campaign.status === 'running') {
      const batchStartTime = Date.now();

      // Get current template index
      const currentTemplateIndex = campaign.current_template_index || 0;
      const totalTemplates = campaign.template_names?.length || 0;

      // CRITICAL FIX: Reset stuck 'processing' entries from previous crashes/restarts
      // Only reset entries that don't have a WAMID (weren't actually sent)
      // REDUCED to 2 minutes to prevent template blocking
      const STUCK_TIMEOUT_MINUTES = 2;
      const stuckCutoff = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();

      const { data: stuckEntries, error: stuckError } = await supabase
        .from('send_queue')
        .update({ status: 'ready' })
        .eq('campaign_id', campaignId)
        .eq('status', 'processing')
        .is('whatsapp_message_id', null)
        .lt('updated_at', stuckCutoff)
        .select('id');

      if (stuckEntries && stuckEntries.length > 0) {
        console.log(`[Queue] ⚠️  Reset ${stuckEntries.length} stuck 'processing' entries to 'ready'`);
      }

      // Fetch ready messages for current template
      const { data: messages, error: fetchError } = await supabase
        .from('send_queue')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'ready')
        .eq('template_order', currentTemplateIndex)
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      // STRAGGLER PROCESSING: If current template batch is small, add stragglers from previous templates
      // This handles messages that were skipped when we moved to next template (due to smart skip logic)
      let stragglers = [];
      if (currentTemplateIndex > 0 && messages && messages.length < BATCH_SIZE) {
        const stragglerLimit = Math.min(50, BATCH_SIZE - messages.length);
        const { data: stragglersData, error: stragglerError } = await supabase
          .from('send_queue')
          .select('*')
          .eq('campaign_id', campaignId)
          .eq('status', 'ready')
          .lt('template_order', currentTemplateIndex) // Only previous templates
          .order('template_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(stragglerLimit);

        if (!stragglerError && stragglersData && stragglersData.length > 0) {
          stragglers = stragglersData;
          console.log(`[Queue] 📦 Adding ${stragglers.length} stragglers from previous templates to current batch`);
        }
      }

      // Combine current template messages with stragglers
      const allMessages = messages ? [...messages, ...stragglers] : stragglers;

      if (fetchError) {
        console.error(`[Queue] Error fetching messages:`, fetchError);
        // Wait before retrying to let connection pool recover
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue; // Retry instead of breaking
      }

      if (!allMessages || allMessages.length === 0) {
        consecutiveEmptyBatches++;

        // Check if we should move to next template
        if (currentTemplateIndex < totalTemplates - 1) {
          // Get counts for current template
          const { data: templateCounts } = await supabase
            .from('send_queue')
            .select('status')
            .eq('campaign_id', campaignId)
            .eq('template_order', currentTemplateIndex);

          const processingCount = templateCounts.filter(m => m.status === 'processing').length;
          const readyCount = templateCounts.filter(m => m.status === 'ready').length;
          const totalInTemplate = templateCounts.length;
          const completedCount = totalInTemplate - processingCount - readyCount;

          // SMART SKIP LOGIC: Move to next template if:
          // 1. No processing entries (all done), OR
          // 2. <1% stuck in processing AND >99% complete (don't wait for stragglers)
          const percentComplete = (completedCount / totalInTemplate) * 100;
          const percentStuck = (processingCount / totalInTemplate) * 100;

          if (processingCount === 0 || (percentStuck < 1 && percentComplete > 99)) {
            // Move to next template
            const nextTemplateIndex = currentTemplateIndex + 1;

            if (processingCount > 0) {
              console.log(`[Queue] ⚠️ Template ${currentTemplateIndex} skipping ${processingCount} stuck entries (${percentStuck.toFixed(2)}% stuck, ${percentComplete.toFixed(1)}% complete)`);
              console.log(`[Queue] Moving to template ${nextTemplateIndex} - stuck entries will auto-reset in ${STUCK_TIMEOUT_MINUTES} min`);
            } else {
              console.log(`[Queue] ✅ Template ${currentTemplateIndex} complete, moving to template ${nextTemplateIndex}`);
            }

            await supabase
              .from('campaigns')
              .update({ current_template_index: nextTemplateIndex })
              .eq('id', campaignId);

            campaign.current_template_index = nextTemplateIndex;
            consecutiveEmptyBatches = 0;
            continue;
          }
        }

        // Check if campaign is complete
        if (consecutiveEmptyBatches >= 3) {
          const { count: pendingCount } = await supabase
            .from('send_queue')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .in('status', ['ready', 'processing']);

          if (pendingCount === 0) {
            // Campaign complete
            await flushCounterCache(campaignId, true);

            await supabase
              .from('campaigns')
              .update({
                status: 'completed',
                end_time: new Date().toISOString()
              })
              .eq('id', campaignId);

            // Calculate and log final metrics
            const totalTime = (Date.now() - metrics.startTime) / 1000;
            const avgSpeed = metrics.totalSent / totalTime;
            console.log(`[Queue] ✅ Campaign ${campaignId} completed!`);
            console.log(`[Queue] Total sent: ${metrics.totalSent}, Failed: ${metrics.totalFailed}`);
            console.log(`[Queue] Total time: ${totalTime.toFixed(1)}s, Avg speed: ${avgSpeed.toFixed(1)} msg/sec`);

            break;
          }
        }

        // Small delay before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      consecutiveEmptyBatches = 0;
      console.log(`[Queue] Processing batch of ${allMessages.length} messages (${messages?.length || 0} current + ${stragglers.length} stragglers) at ${rateState.currentRate} msg/sec`);

      // Mark batch as processing
      const messageIds = allMessages.map(m => m.id);
      await supabase
        .from('send_queue')
        .update({ status: 'processing' })
        .in('id', messageIds);

      // OPTIMIZED PARALLEL PROCESSING with Promise.allSettled
      const limit = pLimit(MAX_CONCURRENT);

      // Calculate dynamic delay based on current adaptive rate
      const dynamicDelay = Math.max(10, Math.floor(1000 / (rateState.currentRate || 40)));

      const sendPromises = allMessages.map((message, index) =>
        limit(async () => {
          // Add delay between sends to respect rate limit (except for first message)
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, dynamicDelay));
          }
          try {
            // CRITICAL FIX: Idempotency check - verify this message wasn't already sent
            // This prevents duplicate sends after PM2 restarts or race conditions
            const { data: currentEntry } = await supabase
              .from('send_queue')
              .select('whatsapp_message_id, status')
              .eq('id', message.id)
              .single();

            if (currentEntry.whatsapp_message_id) {
              // Message already sent (has WAMID) - skip to prevent duplicate
              console.log(`[Queue] ⚠️  Skipping already-sent message ${message.id} (WAMID: ${currentEntry.whatsapp_message_id})`);
              return {
                success: true,
                skipped: true,
                messageId: message.id,
                phone: message.phone
              };
            }

            // Get template from cache
            let template = templateMap[message.template_name];

            if (!template) {
              // Lazy fetch if not in cache
              const { data: fetchedTemplate } = await supabase
                .from('templates')
                .select('components, language')
                .eq('whatsapp_number_id', message.whatsapp_number_id)
                .eq('name', message.template_name)
                .single();

              if (fetchedTemplate) {
                template = fetchedTemplate;
                templateMap[message.template_name] = template;
              } else {
                throw new Error(`Template ${message.template_name} not found`);
              }
            }

            // Send message
            const result = await sendTemplateMessage(
              whatsappNumber.phone_number_id,
              whatsappNumber.access_token,
              message.phone,
              message.template_name,
              template.language,
              message.payload,
              template.components
            );

            if (result.success) {
              // CRITICAL FIX: Immediately store WAMID to prevent duplicate sends
              // This happens BEFORE any other database updates to ensure idempotency
              await supabase
                .from('send_queue')
                .update({
                  whatsapp_message_id: result.messageId,
                  actual_sent_at: new Date().toISOString()
                })
                .eq('id', message.id);

              await adjustRate(message.whatsapp_number_id, rateState, null, maxLimit);
              return {
                success: true,
                messageId: message.id,
                whatsappMessageId: result.messageId,
                phone: message.phone,
                campaignId: message.campaign_id,
                templateName: message.template_name
              };
            } else {
              throw new Error(result.error || 'Failed to send message');
            }

          } catch (error) {
            const errorCode = error.response?.data?.error?.code ||
                            error.response?.data?.error?.error_subcode;

            // Handle rate limiting
            if (errorCode === 130429 || errorCode === 80007) {
              await adjustRate(message.whatsapp_number_id, rateState, errorCode, maxLimit);
            }

            return {
              success: false,
              messageId: message.id,
              errorMessage: error.message,
              errorCode: errorCode
            };
          }
        })
      );

      // Wait for all messages in batch to complete
      const results = await Promise.allSettled(sendPromises);

      // Process results
      const sentMessages = [];
      const skippedMessages = [];
      const failedMessages = [];
      const spamMessages = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          // Check if message was skipped (already sent)
          if (result.value.skipped) {
            skippedMessages.push({
              queueId: result.value.messageId,
              phone: result.value.phone
            });
          } else {
            sentMessages.push({
              queueId: result.value.messageId,
              whatsappMessageId: result.value.whatsappMessageId,
              phone: result.value.phone,
              campaignId: result.value.campaignId,
              templateName: result.value.templateName
            });
          }
        } else {
          const errorInfo = result.status === 'fulfilled' ? result.value :
                          { messageId: allMessages[index].id, errorMessage: result.reason?.message };

          if (errorInfo.errorCode === 131048) {
            spamMessages.push(errorInfo.messageId);
          }

          failedMessages.push(errorInfo);
        }
      });

      // Batch database updates
      const now = new Date().toISOString();

      // Update sent messages
      if (sentMessages.length > 0) {
        // Update queue status
        await supabase
          .from('send_queue')
          .update({ status: 'sent', sent_at: now })
          .in('id', sentMessages.map(m => m.queueId));

        // Insert message records
        const messageRecords = sentMessages.map(m => ({
          whatsapp_number_id: whatsappNumber.id,
          whatsapp_message_id: m.whatsappMessageId,
          user_phone: m.phone,
          direction: 'outgoing',
          message_type: 'template',
          campaign_id: m.campaignId,
          template_name: m.templateName,
          status: 'sent'
        }));

        await supabase.from('messages').insert(messageRecords);

        // Update counters
        cache.pendingSent += sentMessages.length;
        metrics.totalSent += sentMessages.length;
      }

      // Update failed messages
      if (failedMessages.length > 0) {
        await supabase
          .from('send_queue')
          .update({
            status: 'failed',
            error_message: failedMessages[0].errorMessage
          })
          .in('id', failedMessages.map(m => m.messageId));

        cache.pendingFailed += failedMessages.length;
        metrics.totalFailed += failedMessages.length;
      }

      // Handle spam detection
      if (spamMessages.length > 0) {
        await supabase
          .from('send_queue')
          .update({ spam_error_detected: true })
          .in('id', spamMessages);

        // Check if we need to pause for spam
        const { data: spamCount } = await supabase
          .rpc('count_recent_spam_errors', {
            p_campaign_id: campaignId,
            p_minutes_ago: 10
          });

        if ((spamCount || 0) >= 30) {
          await handleSpamAutoPause(campaignId, whatsappNumber.id);
          break; // Exit processing loop
        }
      }

      // Update performance metrics
      const batchTime = Date.now() - batchStartTime;
      metrics.batchCount++;
      metrics.avgBatchTime = (metrics.avgBatchTime * (metrics.batchCount - 1) + batchTime) / metrics.batchCount;

      // Update lastUpdateTime to prevent stale detection
      rateState.lastUpdateTime = Date.now();

      // Flush cache periodically
      cache.batchesSinceLastUpdate++;
      await flushCounterCache(campaignId);

      // Log performance
      const batchThroughput = sentMessages.length / (batchTime / 1000);
      const overallThroughput = metrics.totalSent / ((Date.now() - metrics.startTime) / 1000);
      console.log(`[Queue] Batch complete: ${sentMessages.length} sent, ${failedMessages.length} failed${skippedMessages.length > 0 ? `, ${skippedMessages.length} skipped (already sent)` : ''}`);
      console.log(`[Queue] Batch throughput: ${batchThroughput.toFixed(1)} msg/sec, Overall: ${overallThroughput.toFixed(1)} msg/sec`);

      // Dynamic delay based on rate limit
      if (rateState.currentRate < 100) {
        // Only add delay if we're being rate limited
        const delay = Math.max(10, 1000 / rateState.currentRate);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      // No delay for high rates - continuous processing

      // Re-check campaign status
      const { data: updatedCampaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .single();

      if (updatedCampaign) {
        campaign.status = updatedCampaign.status;
      }
    }

  } catch (error) {
    console.error(`[Queue] Error processing campaign ${campaignId}:`, error);
  } finally {
    // Clean up - reset isProcessing for the WhatsApp number
    if (rateState) {
      rateState.isProcessing = false;
    } else if (campaign?.whatsapp_number_id) {
      // If rateState wasn't assigned yet, get it from the map and reset
      const state = rateControlState.get(campaign.whatsapp_number_id);
      if (state) {
        state.isProcessing = false;
      }
    }

    // Force flush any remaining counters
    await flushCounterCache(campaignId, true);

    // Clean up caches
    counterCache.delete(campaignId);
    performanceMetrics.delete(campaignId);
  }
}

/**
 * Main queue processor - monitors all active campaigns
 */
async function processQueue() {
  try {
    // Get all running campaigns
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, whatsapp_number_id')
      .eq('status', 'running')
      .order('created_at', { ascending: true });

    if (error || !campaigns || campaigns.length === 0) {
      return;
    }

    console.log(`[Queue] Found ${campaigns.length} running campaigns`);

    // Group campaigns by WhatsApp number
    const campaignsByNumber = new Map();
    campaigns.forEach(campaign => {
      if (!campaignsByNumber.has(campaign.whatsapp_number_id)) {
        campaignsByNumber.set(campaign.whatsapp_number_id, []);
      }
      campaignsByNumber.get(campaign.whatsapp_number_id).push(campaign.id);
    });

    // Process campaigns (sequential per number, parallel across numbers)
    const processingPromises = [];

    for (const [numberId, campaignIds] of campaignsByNumber) {
      // Get rate state to check if processing
      const rateState = rateControlState.get(numberId);

      // CRITICAL FIX: Check if isProcessing is stale (no activity for >10 seconds)
      // This handles cases where processing was interrupted by restart/crash
      const isStale = rateState?.isProcessing &&
                     rateState?.lastUpdateTime &&
                     (Date.now() - rateState.lastUpdateTime) > 10000;

      if (isStale) {
        console.log(`[Queue] Detected stale isProcessing for number ${numberId} - resetting`);
        rateState.isProcessing = false;
      }

      console.log(`[Queue] Number ${numberId}: rateState exists=${!!rateState}, isProcessing=${rateState?.isProcessing}, stale=${isStale}`);

      if (!rateState || !rateState.isProcessing) {
        // Process first campaign for this number
        const firstCampaignId = campaignIds[0];
        console.log(`[Queue] Starting processing for campaign ${firstCampaignId}`);

        // CRITICAL: Set isProcessing BEFORE calling processCampaignQueue to prevent race condition
        if (!rateState) {
          // Initialize rate state if it doesn't exist
          rateControlState.set(numberId, {
            currentRate: 80,
            errorCount: 0,
            consecutiveErrorCount: 0,
            lastErrorTime: null,
            successWindow: [],
            errorWindow: [],
            isProcessing: true,  // Set immediately
            lastUpdateTime: Date.now(),
            totalMessagesSent: 0,
            lastRateIncrease: Date.now()
          });
        } else {
          rateState.isProcessing = true;  // Set immediately
          rateState.lastUpdateTime = Date.now();
        }

        processingPromises.push(
          processCampaignQueue(firstCampaignId).catch(err => {
            console.error(`[Queue] Error in campaign ${firstCampaignId}:`, err);
            // Reset isProcessing on error
            const state = rateControlState.get(numberId);
            if (state) state.isProcessing = false;
          })
        );
      } else {
        console.log(`[Queue] Skipping number ${numberId} - already processing`);
      }
    }

    // Note: Don't await here - let campaigns process independently
    // The isProcessing flag in rateState prevents duplicate processing per number
    // Awaiting would block the entire processor and exhaust connection pool

  } catch (error) {
    console.error('[Queue] Error in main queue processor:', error);
  }
}

/**
 * Start queue processor with continuous polling for maximum throughput
 */
function startQueueProcessor() {
  console.log('[Queue] Starting high-performance queue processor...');

  // CRITICAL FIX: Clear ALL rate control states from previous runs
  // This prevents campaigns from being permanently blocked after crashes/restarts
  // We clear the entire Map to ensure clean state on startup
  console.log('[Queue] Clearing all rate control states from previous runs...');
  const previousCount = rateControlState.size;
  rateControlState.clear();
  console.log(`[Queue] Cleared ${previousCount} rate control states - fresh start ready`);

  let isProcessing = false;

  async function continuousProcess() {
    if (isProcessing) return;

    isProcessing = true;

    try {
      // Check for active campaigns
      const { count: runningCount } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'running');

      if (runningCount > 0) {
        await processQueue();
        // Add delay between iterations to prevent connection pool exhaustion
        setTimeout(continuousProcess, 500);
      } else {
        // No active campaigns, check again after short delay
        setTimeout(continuousProcess, 2000);
      }
    } catch (error) {
      console.error('[Queue] Error in continuous processor:', error);
      setTimeout(continuousProcess, 1000);
    } finally {
      isProcessing = false;
    }
  }

  // Start continuous processing
  continuousProcess();

  // Also set up periodic check as backup
  setInterval(async () => {
    const { count } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running');

    if (count > 0 && !isProcessing) {
      continuousProcess();
    }
  }, 5000);

  console.log('[Queue] High-performance processor started!');
}

// Helper function for retry delays (simplified - no automatic retries in this version)
function getRetryDelay(retryCount) {
  const delays = [5000, 20000, 45000]; // 5s, 20s, 45s
  return delays[Math.min(retryCount, delays.length - 1)];
}

module.exports = {
  processQueue,
  processCampaignQueue,
  startQueueProcessor
};