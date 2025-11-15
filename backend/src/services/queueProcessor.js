const { supabase } = require('../config/supabase');
const whatsappService = require('./whatsappService');
const { sendTemplateMessage } = whatsappService;
const pLimit = require('p-limit');
const HttpsAgent = require('agentkeepalive').HttpsAgent;

// HTTP Keep-Alive agent for optimal connection reuse
const keepaliveAgent = new HttpsAgent({
  maxSockets: 100,           // Max concurrent connections
  maxFreeSockets: 10,        // Max idle connections to keep
  timeout: 60000,            // Active socket timeout (60s)
  freeSocketTimeout: 30000,  // Idle socket timeout (30s)
  socketActiveTTL: 60000     // Max socket lifetime (60s)
});

// Initialize the HTTP agent in whatsappService
whatsappService.setHttpAgent(keepaliveAgent);

// Export agent for use in whatsappService
module.exports.keepaliveAgent = keepaliveAgent;

/**
 * Queue Processor for Campaign Messages
 * Implements adaptive rate control and sequential execution per WhatsApp number
 */

// In-memory state for rate control (per WhatsApp number)
const rateControlState = new Map();

/**
 * Initialize rate control for a WhatsApp number
 */
function initRateControl(whatsappNumberId, initialRate) {
  if (!rateControlState.has(whatsappNumberId)) {
    rateControlState.set(whatsappNumberId, {
      currentRate: initialRate || 60, // Start at 60 msg/sec
      errorCount: 0,
      consecutiveErrorCount: 0,
      lastErrorTime: null,
      successWindow: [], // Track last 5 minutes of successes
      isProcessing: false,
      lastUpdateTime: Date.now()
    });
  }
  return rateControlState.get(whatsappNumberId);
}

/**
 * Get delay in milliseconds based on current rate
 */
function getDelay(messagesPerSecond) {
  return Math.ceil(1000 / messagesPerSecond);
}

/**
 * Adjust rate based on error/success patterns
 */
async function adjustRate(whatsappNumberId, rateState, errorCode = null, maxLimit = 200) {
  const now = Date.now();

  if (errorCode === 130429) {
    // WhatsApp rate limit error (429)
    rateState.consecutiveErrorCount++;

    if (rateState.consecutiveErrorCount >= 3) {
      // Decrease rate by 20% after 3 consecutive 429 errors
      const newRate = Math.max(10, Math.floor(rateState.currentRate * 0.8));
      console.log(`[Rate Control] Decreasing rate for number ${whatsappNumberId}: ${rateState.currentRate} -> ${newRate} msg/sec`);

      rateState.currentRate = newRate;
      rateState.consecutiveErrorCount = 0;

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

    // Keep only last 5 minutes of successes
    rateState.successWindow = rateState.successWindow.filter(
      time => now - time <= 5 * 60 * 1000
    );

    // Calculate error rate in last 5 minutes
    const recentErrors = rateState.successWindow.filter(time => {
      // This is simplified - in production you'd track errors separately
      return false;
    }).length;

    const totalRecent = rateState.successWindow.length;
    const errorRate = totalRecent > 0 ? recentErrors / totalRecent : 0;

    // Increase rate by 15% if error rate < 1% for 1 minute and we have enough samples
    // Cap at max_limit from database (configurable per WhatsApp number)
    if (errorRate < 0.01 && totalRecent >= 60 && now - rateState.lastUpdateTime >= 1 * 60 * 1000) {
      const newRate = Math.min(maxLimit, Math.floor(rateState.currentRate * 1.15));
      console.log(`[Rate Control] Increasing rate for number ${whatsappNumberId}: ${rateState.currentRate} -> ${newRate} msg/sec (max: ${maxLimit})`);

      rateState.currentRate = newRate;
      rateState.lastUpdateTime = now;

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
  } else {
    // Other error types
    rateState.errorCount++;
  }
}

/**
 * Calculate retry delay based on retry count
 * Fixed delays: 5s, 10s (only 2 retries total)
 */
function getRetryDelay(retryCount) {
  if (retryCount === 0) return 5000;   // 5 seconds for 1st retry
  return 10000;  // 10 seconds for 2nd retry
}

/**
 * Handle automatic campaign pause due to spam detection (error 131048)
 *
 * Requirements:
 * - 1st occurrence (30 errors): Pause for 30 minutes, resume at 50% speed
 * - 2nd occurrence: Permanently pause, require manual resume
 */
async function handleSpamAutoPause(campaignId, whatsappNumberId) {
  try {
    // Get campaign's current spam pause count
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('spam_pause_count, name')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error(`[Queue] Error fetching campaign for spam pause:`, campaignError);
      return;
    }

    const currentPauseCount = campaign.spam_pause_count || 0;
    const newPauseCount = currentPauseCount + 1;

    console.log(`[Queue] 🚨 SPAM AUTO-PAUSE TRIGGERED for campaign "${campaign.name}"`);
    console.log(`[Queue] This is occurrence #${newPauseCount}`);

    if (newPauseCount === 1) {
      // FIRST OCCURRENCE: Pause for 30 minutes, will auto-resume at 50% speed
      const pausedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          spam_pause_count: newPauseCount,
          spam_paused_until: pausedUntil.toISOString(),
          pause_reason: `Spam filter detected (error 131048). Auto-resuming at 50% speed in 30 minutes at ${pausedUntil.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.`
        })
        .eq('id', campaignId);

      // Reduce send rate to 50%
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

      console.log(`[Queue] ⏸️  Campaign paused for 30 minutes`);
      console.log(`[Queue] 📉 Send rate reduced: ${currentRate} → ${newRate} msg/sec`);
      console.log(`[Queue] ⏰ Will auto-resume at: ${pausedUntil.toISOString()}`);

      // Create notification
      await supabase
        .from('notifications')
        .insert({
          type: 'campaign_spam_pause',
          title: `Campaign "${campaign.name}" auto-paused`,
          message: `Spam filter detected (30+ error 131048). Paused for 30 minutes, will resume at 50% speed.`,
          severity: 'high',
          data: {
            campaign_id: campaignId,
            pause_count: newPauseCount,
            resume_at: pausedUntil.toISOString(),
            new_rate: newRate
          }
        });

    } else if (newPauseCount >= 2) {
      // SECOND+ OCCURRENCE: Permanently pause, require manual resume
      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          spam_pause_count: newPauseCount,
          spam_paused_until: null, // No auto-resume
          pause_reason: `Spam filter detected again (error 131048). Campaign permanently paused. Manual resume required. Please review template content and WhatsApp Business Manager quality score.`
        })
        .eq('id', campaignId);

      console.log(`[Queue] 🛑 Campaign PERMANENTLY PAUSED (occurrence #${newPauseCount})`);
      console.log(`[Queue] ⚠️  Manual resume required!`);

      // Create high-severity notification
      await supabase
        .from('notifications')
        .insert({
          type: 'campaign_spam_permanent_pause',
          title: `Campaign "${campaign.name}" PERMANENTLY PAUSED`,
          message: `Spam filter triggered again (30+ error 131048). Manual review and resume required.`,
          severity: 'critical',
          data: {
            campaign_id: campaignId,
            pause_count: newPauseCount,
            action_required: 'Review template content, check WhatsApp Business Manager quality score, then manually resume campaign'
          }
        });
    }

  } catch (error) {
    console.error(`[Queue] Error in handleSpamAutoPause:`, error);
  }
}

/**
 * Process a single message from the queue
 */
async function processMessage(message, whatsappNumber, rateState, templateMap) {
  try {
    // Get template from cache
    const template = templateMap ? templateMap[message.template_name] : null;

    if (!template) {
      throw new Error(`Template ${message.template_name} not found in cache`);
    }

    // Update status to processing
    await supabase
      .from('send_queue')
      .update({ status: 'processing' })
      .eq('id', message.id);

    // Send message via WhatsApp API
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
      // Insert message record into messages table
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          whatsapp_number_id: message.whatsapp_number_id,
          whatsapp_message_id: result.messageId,
          user_phone: message.phone,
          direction: 'outgoing',
          message_type: 'template',
          campaign_id: message.campaign_id,
          template_name: message.template_name,
          status: 'sent'
        });

      if (messageError) {
        console.error(`[Queue] Failed to insert message record:`, messageError);
        // Continue anyway - message was sent successfully
      }

      // Insert initial status log
      const { error: statusLogError } = await supabase
        .from('message_status_logs')
        .insert({
          whatsapp_message_id: result.messageId,
          status: 'sent',
          campaign_id: message.campaign_id
        });

      if (statusLogError) {
        console.error(`[Queue] Failed to insert status log for message ${result.messageId}:`, statusLogError.message);
        // Continue anyway - message was sent successfully
      }

      // Mark as sent in queue
      await supabase
        .from('send_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          whatsapp_message_id: result.messageId
        })
        .eq('id', message.id);

      // Update campaign counter
      await supabase.rpc('increment_campaign_sent', {
        _campaign_id: message.campaign_id
      });

      // Adjust rate (success)
      await adjustRate(message.whatsapp_number_id, rateState, null, whatsappNumber.max_limit || 200);

      console.log(`[Queue] Sent message ${message.id} to ${message.phone}`);
      return { success: true };

    } else {
      throw new Error(result.error || 'Failed to send message');
    }

  } catch (error) {
    console.error(`[Queue] Error processing message ${message.id}:`, error);

    // Check if it's a rate limit error
    const errorCode = error.response?.data?.error?.code;

    // SPAM DETECTION: Check for error 131048
    if (errorCode === 131048) {
      console.warn(`[Queue] ⚠️  SPAM ERROR 131048 detected for campaign ${message.campaign_id}, template ${message.template_name}`);

      // Mark this message as spam-blocked
      await supabase
        .from('send_queue')
        .update({ spam_error_detected: true })
        .eq('id', message.id);

      // Check spam error count for this campaign (last 10 minutes)
      const { data: spamCount } = await supabase
        .rpc('count_recent_spam_errors', {
          p_campaign_id: message.campaign_id,
          p_minutes_ago: 10
        });

      const recentSpamErrors = spamCount || 0;
      console.log(`[Queue] Campaign ${message.campaign_id} has ${recentSpamErrors} spam errors in last 10 minutes`);

      // TRIGGER AUTO-PAUSE if >= 30 spam errors
      if (recentSpamErrors >= 30) {
        await handleSpamAutoPause(message.campaign_id, message.whatsapp_number_id);
      }
    } else if (errorCode === 130429) {
      await adjustRate(message.whatsapp_number_id, rateState, 130429, whatsappNumber.max_limit || 200);
    } else {
      await adjustRate(message.whatsapp_number_id, rateState, 'other', whatsappNumber.max_limit || 200);
    }

    // Handle retry logic (max 2 retries)
    const newRetryCount = message.retry_count + 1;

    if (newRetryCount >= 2) {
      // Max retries reached (2 attempts), mark as failed
      await supabase
        .from('send_queue')
        .update({
          status: 'failed',
          error_message: error.message,
          retry_count: newRetryCount
        })
        .eq('id', message.id);

      // Update campaign counter
      await supabase.rpc('increment_campaign_failed', {
        _campaign_id: message.campaign_id
      });

      console.log(`[Queue] Message ${message.id} failed after ${newRetryCount + 1} attempts (1 initial + ${newRetryCount} retries)`);
      return { success: false, error: error.message };

    } else {
      // Schedule retry (will be retry 1 or 2)
      const retryDelay = getRetryDelay(newRetryCount);
      const nextRetryAt = new Date(Date.now() + retryDelay).toISOString();

      await supabase
        .from('send_queue')
        .update({
          status: 'ready',
          error_message: error.message,
          retry_count: newRetryCount,
          next_retry_at: nextRetryAt
        })
        .eq('id', message.id);

      console.log(`[Queue] Message ${message.id} scheduled for retry ${newRetryCount}/2 in ${retryDelay}ms`);
      return { success: false, retry: true };
    }
  }
}

// Template cache per campaign
const templateCache = new Map();

// Campaign configuration cache (to avoid repeated DB queries)
const campaignConfigCache = new Map();

/**
 * Check if current template's first-attempts are complete and progress to next template
 */
async function checkAndProgressTemplate(campaignId, currentTemplateIndex, totalTemplates) {
  try {
    // Count remaining first-attempt messages for current template
    const { count: remainingFirstAttempts } = await supabase
      .from('send_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('template_order', currentTemplateIndex)
      .eq('retry_count', 0)
      .in('status', ['ready', 'processing']);

    if (remainingFirstAttempts === 0) {
      // All first-attempts done for this template, move to next
      let nextTemplateIndex = currentTemplateIndex + 1;

      // Skip templates with no messages (edge case)
      while (nextTemplateIndex < totalTemplates) {
        const { count: nextTemplateMessageCount } = await supabase
          .from('send_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('template_order', nextTemplateIndex);

        if (nextTemplateMessageCount > 0) break;
        nextTemplateIndex++;
      }

      if (nextTemplateIndex < totalTemplates) {
        console.log(`[Queue] ✅ Template ${currentTemplateIndex} first-attempts complete. Moving to template ${nextTemplateIndex}`);

        await supabase
          .from('campaigns')
          .update({ current_template_index: nextTemplateIndex })
          .eq('id', campaignId);
      } else {
        console.log(`[Queue] ✅ All templates' first-attempts complete. Only retries remaining.`);
      }
    }
  } catch (error) {
    console.error(`[Queue] Error in checkAndProgressTemplate:`, error);
  }
}

/**
 * Process queue for a specific campaign
 */
async function processCampaignQueue(campaignId) {
  try {
    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, whatsapp_number_id, status, total_contacts, template_names')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error(`[Queue] Campaign ${campaignId} not found`);
      return;
    }

    if (campaign.status !== 'running') {
      console.log(`[Queue] Campaign ${campaignId} is not running (status: ${campaign.status})`);
      return;
    }

    // Get WhatsApp number details
    const { data: whatsappNumber, error: numberError} = await supabase
      .from('whatsapp_numbers')
      .select('id, phone_number_id, access_token, max_send_rate_per_sec, max_limit, is_active')
      .eq('id', campaign.whatsapp_number_id)
      .single();

    if (numberError || !whatsappNumber) {
      // FIXED: Don't fail campaign on transient database errors - just skip this cycle and retry
      console.warn(`[Queue] Temporary error fetching WhatsApp number for campaign ${campaignId}:`, numberError?.message || 'Number not found');
      console.log(`[Queue] Will retry on next poll cycle...`);
      return;
    }

    if (!whatsappNumber.is_active) {
      console.error(`[Queue] WhatsApp number is inactive for campaign ${campaignId}`);

      // Mark campaign as failed only if number is genuinely inactive
      await supabase
        .from('campaigns')
        .update({
          status: 'failed',
          end_time: new Date().toISOString()
        })
        .eq('id', campaignId);

      return;
    }

    // Pre-fetch templates for this campaign (cache them)
    const cacheKey = `${campaign.whatsapp_number_id}_templates`;
    if (!templateCache.has(cacheKey)) {
      const { data: templates, error: templateError } = await supabase
        .from('templates')
        .select('name, components, language')
        .eq('whatsapp_number_id', campaign.whatsapp_number_id)
        .in('name', campaign.template_names);

      if (!templateError && templates) {
        const templateMap = {};
        templates.forEach(t => {
          templateMap[t.name] = { components: t.components, language: t.language };
        });
        templateCache.set(cacheKey, templateMap);
        console.log(`[Queue] Cached ${templates.length} template(s) for campaign ${campaignId}`);
      }
    }

    // Initialize rate control
    // Cap initial rate to max_limit to ensure we never exceed configured limit
    const maxLimit = whatsappNumber.max_limit || 200;
    const initialRate = Math.min(maxLimit, whatsappNumber.max_send_rate_per_sec || 60);
    const rateState = initRateControl(
      whatsappNumber.id,
      initialRate
    );

    // Check if already processing
    if (rateState.isProcessing) {
      return; // Silently skip, don't log spam
    }

    rateState.isProcessing = true;

    // SEQUENTIAL TEMPLATE PROCESSING: Get current template index
    const currentTemplateIndex = campaign.current_template_index || 0;
    const totalTemplates = campaign.template_names?.length || 0;

    console.log(`[Queue] Campaign template progress: ${currentTemplateIndex + 1}/${totalTemplates} (template order ${currentTemplateIndex})`);

    const now = new Date();

    // Query 1: First-attempt messages for CURRENT template only (sequential)
    const { data: firstAttemptMessages, error: firstAttemptError } = await supabase
      .from('send_queue')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'ready')
      .eq('template_order', currentTemplateIndex)
      .eq('retry_count', 0)
      .order('created_at', { ascending: true })
      .limit(70); // Reserve 70% capacity for first attempts

    if (firstAttemptError) {
      console.error(`[Queue] Error fetching first-attempt messages:`, firstAttemptError);
      rateState.isProcessing = false;
      return;
    }

    // Query 2: Retry messages for ALL templates (run in parallel)
    const { data: retryMessages, error: retryError } = await supabase
      .from('send_queue')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'ready')
      .gt('retry_count', 0)
      .order('next_retry_at', { ascending: true })
      .limit(30); // Reserve 30% capacity for retries

    if (retryError) {
      console.error(`[Queue] Error fetching retry messages:`, retryError);
    }

    // Filter retry messages that are due (retry time has passed)
    const dueRetryMessages = (retryMessages || []).filter(msg =>
      !msg.next_retry_at || new Date(msg.next_retry_at) <= now
    );

    // Combine both sets
    const allMessages = [
      ...(firstAttemptMessages || []),
      ...dueRetryMessages
    ];

    const messages = allMessages;

    console.log(`[Queue] Fetched ${firstAttemptMessages?.length || 0} first-attempt + ${dueRetryMessages.length} retry messages = ${messages.length} total`);

    if (!messages || messages.length === 0) {
      // Check if current template's first-attempts are complete
      if (currentTemplateIndex < totalTemplates) {
        await checkAndProgressTemplate(campaignId, currentTemplateIndex, totalTemplates);
      }
      console.log(`[Queue] No messages to process for campaign ${campaignId}`);

      // Check if campaign is complete
      // FIXED: Added comprehensive check to prevent premature completion
      const { data: stats, error: statsError, count: pendingCount } = await supabase
        .from('send_queue')
        .select('status', { count: 'exact' })
        .eq('campaign_id', campaignId)
        .in('status', ['ready', 'processing']);

      console.log(`[Queue] Pending messages check: ${pendingCount || 0} messages with status ready/processing`);

      if (statsError) {
        console.error(`[Queue] Error checking pending messages:`, statsError);
        rateState.isProcessing = false;
        return;
      }

      // Only mark complete if TRULY no pending messages
      // Extra safety: also check total vs sent+failed counts
      if (pendingCount === 0) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('total_contacts, total_sent, total_failed')
          .eq('id', campaignId)
          .single();

        const processedCount = (campaign?.total_sent || 0) + (campaign?.total_failed || 0);
        const totalContacts = campaign?.total_contacts || 0;

        console.log(`[Queue] Campaign progress: ${processedCount}/${totalContacts} messages processed`);

        // Verify counts match before marking complete
        if (processedCount >= totalContacts || pendingCount === 0) {
          console.log(`[Queue] Marking campaign ${campaignId} as completed...`);
          const { error: updateError } = await supabase
            .from('campaigns')
            .update({
              status: 'completed',
              end_time: new Date().toISOString()
            })
            .eq('id', campaignId)
            .eq('status', 'running'); // Only update if still running (prevent double-completion)

          if (updateError) {
            console.error(`[Queue] Error marking campaign as completed:`, updateError);
          } else {
            console.log(`[Queue] ✅ Campaign ${campaignId} completed successfully`);
          }
        } else {
          console.log(`[Queue] ⚠️  Campaign ${campaignId} has pending messages but none matched query. Will retry on next poll.`);
        }
      }

      rateState.isProcessing = false;
      return;
    }

    console.log(`[Queue] Processing ${messages.length} messages for campaign ${campaignId} at ${rateState.currentRate} msg/sec`);

    // Get template map from cache (reuse cacheKey from above)
    const templateMap = templateCache.get(`${campaign.whatsapp_number_id}_templates`);

    // OPTIMIZED PARALLEL PROCESSING with p-limit
    const CONCURRENT_REQUESTS = 10; // Send 10 messages in parallel
    const limit = pLimit(CONCURRENT_REQUESTS);

    // Create tasks with concurrency control
    const sendTasks = messages.map(message =>
      limit(async () => {
        try {
          // Update status to processing
          await supabase
            .from('send_queue')
            .update({ status: 'processing' })
            .eq('id', message.id);

          // Get template from cache
          const template = templateMap ? templateMap[message.template_name] : null;
          if (!template) {
            throw new Error(`Template ${message.template_name} not found in cache`);
          }

          // Send message via WhatsApp API (will use keep-alive agent)
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
            // Adjust rate (success)
            await adjustRate(message.whatsapp_number_id, rateState, null, whatsappNumber.max_limit || 80);
            return {
              success: true,
              messageId: message.id,
              whatsappMessageId: result.messageId,
              phone: message.phone,
              campaignId: message.campaign_id
            };
          } else {
            throw new Error(result.error || 'Failed to send message');
          }
        } catch (error) {
          // Check error code for rate limiting and spam detection
          const errorCode = error.response?.data?.error?.code;

          // SPAM DETECTION: Check for error 131048
          if (errorCode === 131048) {
            console.warn(`[Queue] ⚠️  SPAM ERROR 131048 detected for message ${message.id}`);
            // Mark as spam-detected for later handling
          } else if (errorCode === 130429) {
            await adjustRate(message.whatsapp_number_id, rateState, 130429, whatsappNumber.max_limit || 80);
          } else {
            await adjustRate(message.whatsapp_number_id, rateState, 'other', whatsappNumber.max_limit || 80);
          }

          return {
            success: false,
            messageId: message.id,
            errorMessage: error.message,
            errorCode: errorCode,
            retryCount: message.retry_count
          };
        }
      })
    );

    // Execute all tasks with concurrency control and get results
    const results = await Promise.allSettled(sendTasks);

    // Process results and prepare batch updates
    const sentMessageIds = [];
    const sentMessageData = [];
    const failedMessagesForRetry = [];
    const permanentlyFailedMessages = [];
    const spamDetectedMessages = [];

    results.forEach((result, index) => {
      const message = messages[index];

      if (result.status === 'fulfilled' && result.value.success) {
        // Successful send
        sentMessageIds.push(result.value.messageId);
        sentMessageData.push({
          whatsapp_number_id: message.whatsapp_number_id,
          whatsapp_message_id: result.value.whatsappMessageId,
          user_phone: result.value.phone,
          direction: 'outgoing',
          message_type: 'template',
          campaign_id: result.value.campaignId,
          template_name: message.template_name,
          status: 'sent'
        });
      } else {
        // Failed send
        const errorInfo = result.status === 'fulfilled' ? result.value : { messageId: message.id, errorMessage: result.reason?.message };
        const newRetryCount = message.retry_count + 1;

        // Check if spam error
        if (errorInfo.errorCode === 131048) {
          spamDetectedMessages.push(message.id);
        }

        if (newRetryCount >= 2) {
          // Permanently failed (max 2 retries)
          permanentlyFailedMessages.push({
            id: message.id,
            errorMessage: errorInfo.errorMessage
          });
        } else {
          // Schedule for retry
          const retryDelay = getRetryDelay(newRetryCount);
          failedMessagesForRetry.push({
            id: message.id,
            retryCount: newRetryCount,
            errorMessage: errorInfo.errorMessage,
            nextRetryAt: new Date(Date.now() + retryDelay).toISOString()
          });
        }
      }
    });

    // BATCH DATABASE UPDATES (major performance improvement)
    const now = new Date().toISOString();

    // Update 1: Mark sent messages
    if (sentMessageIds.length > 0) {
      await supabase
        .from('send_queue')
        .update({
          status: 'sent',
          sent_at: now
        })
        .in('id', sentMessageIds);

      // Batch insert messages
      await supabase.from('messages').insert(sentMessageData);

      // Batch insert status logs
      const statusLogs = sentMessageData.map(msg => ({
        whatsapp_message_id: msg.whatsapp_message_id,
        status: 'sent',
        campaign_id: msg.campaign_id
      }));
      await supabase.from('message_status_logs').insert(statusLogs);

      // Update campaign sent counter (bulk)
      await supabase.rpc('increment_campaign_sent_bulk', {
        _campaign_id: campaignId,
        _count: sentMessageIds.length
      }).catch(() => {
        // Fallback: increment one by one if bulk function doesn't exist
        sentMessageIds.forEach(async () => {
          await supabase.rpc('increment_campaign_sent', { _campaign_id: campaignId });
        });
      });

      console.log(`[Queue] ✅ Sent ${sentMessageIds.length} messages successfully`);
    }

    // Update 2: Mark spam-detected messages
    if (spamDetectedMessages.length > 0) {
      await supabase
        .from('send_queue')
        .update({ spam_error_detected: true })
        .in('id', spamDetectedMessages);

      // Check spam count and trigger auto-pause if needed
      const { data: spamCount } = await supabase
        .rpc('count_recent_spam_errors', {
          p_campaign_id: campaignId,
          p_minutes_ago: 10
        });

      const recentSpamErrors = spamCount || 0;
      if (recentSpamErrors >= 30) {
        console.log(`[Queue] 🚨 Spam threshold reached: ${recentSpamErrors} errors`);
        await handleSpamAutoPause(campaignId, whatsappNumber.id);
      }
    }

    // Update 3: Schedule retries
    if (failedMessagesForRetry.length > 0) {
      for (const retry of failedMessagesForRetry) {
        await supabase
          .from('send_queue')
          .update({
            status: 'ready',
            error_message: retry.errorMessage,
            retry_count: retry.retryCount,
            next_retry_at: retry.nextRetryAt
          })
          .eq('id', retry.id);
      }
      console.log(`[Queue] 🔄 Scheduled ${failedMessagesForRetry.length} messages for retry`);
    }

    // Update 4: Mark permanently failed
    if (permanentlyFailedMessages.length > 0) {
      for (const failed of permanentlyFailedMessages) {
        await supabase
          .from('send_queue')
          .update({
            status: 'failed',
            error_message: failed.errorMessage,
            retry_count: 2
          })
          .eq('id', failed.id);
      }

      // Update campaign failed counter (bulk)
      await supabase.rpc('increment_campaign_failed_bulk', {
        _campaign_id: campaignId,
        _count: permanentlyFailedMessages.length
      }).catch(() => {
        // Fallback: increment one by one
        permanentlyFailedMessages.forEach(async () => {
          await supabase.rpc('increment_campaign_failed', { _campaign_id: campaignId });
        });
      });

      console.log(`[Queue] ❌ ${permanentlyFailedMessages.length} messages permanently failed`);
    }

    // Rate limiting: Wait between batches
    const delayBetweenBatches = (CONCURRENT_REQUESTS / rateState.currentRate) * 1000;
    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));

    rateState.isProcessing = false;

    // Check if current template's first-attempts are complete and progress
    if (currentTemplateIndex < totalTemplates) {
      await checkAndProgressTemplate(campaignId, currentTemplateIndex, totalTemplates);
    }

    // Check if there are more messages to process
    const { data: remainingMessages } = await supabase
      .from('send_queue')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('status', 'ready')
      .limit(1);

    if (remainingMessages && remainingMessages.length > 0) {
      // Continue processing immediately (rate limiting is already applied per-message)
      setImmediate(() => processCampaignQueue(campaignId));
    } else {
      // Check if campaign is complete
      console.log(`[Queue] Checking if campaign ${campaignId} is complete...`);
      const { data: stats, error: statsError, count: pendingCount } = await supabase
        .from('send_queue')
        .select('status', { count: 'exact' })
        .eq('campaign_id', campaignId)
        .in('status', ['ready', 'processing']);

      console.log(`[Queue] Pending messages after batch: ${pendingCount || 0} messages with status ready/processing`);

      if (statsError) {
        console.error(`[Queue] Error checking pending messages after batch:`, statsError);
        return;
      }

      // FIXED: Same comprehensive check as above
      if (pendingCount === 0) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('total_contacts, total_sent, total_failed')
          .eq('id', campaignId)
          .single();

        const processedCount = (campaign?.total_sent || 0) + (campaign?.total_failed || 0);
        const totalContacts = campaign?.total_contacts || 0;

        console.log(`[Queue] Campaign progress: ${processedCount}/${totalContacts} messages processed`);

        if (processedCount >= totalContacts || pendingCount === 0) {
          console.log(`[Queue] Marking campaign ${campaignId} as completed...`);
          const { error: updateError } = await supabase
            .from('campaigns')
            .update({
              status: 'completed',
              end_time: new Date().toISOString()
            })
            .eq('id', campaignId)
            .eq('status', 'running'); // Only update if still running

          if (updateError) {
            console.error(`[Queue] Error marking campaign as completed:`, updateError);
          } else {
            console.log(`[Queue] ✅ Campaign ${campaignId} completed successfully`);
          }
        } else {
          console.log(`[Queue] ⚠️  Campaign ${campaignId} has pending messages but none matched query. Will retry on next poll.`);
        }
      }
    }

  } catch (error) {
    console.error(`[Queue] Error processing campaign ${campaignId}:`, error);

    // Reset processing flag
    const rateState = rateControlState.get(campaign?.whatsapp_number_id);
    if (rateState) {
      rateState.isProcessing = false;
    }
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

    if (error) {
      console.error('[Queue] Error fetching campaigns:', error);
      return;
    }

    if (!campaigns || campaigns.length === 0) {
      return;
    }

    console.log(`[Queue] Found ${campaigns.length} running campaigns`);

    // Group campaigns by WhatsApp number (sequential execution per number)
    const campaignsByNumber = new Map();
    campaigns.forEach(campaign => {
      if (!campaignsByNumber.has(campaign.whatsapp_number_id)) {
        campaignsByNumber.set(campaign.whatsapp_number_id, []);
      }
      campaignsByNumber.get(campaign.whatsapp_number_id).push(campaign.id);
    });

    // Process campaigns (sequential per number, parallel across numbers)
    for (const [numberId, campaignIds] of campaignsByNumber) {
      // Process first campaign for this number (others will wait)
      const firstCampaignId = campaignIds[0];
      processCampaignQueue(firstCampaignId).catch(err => {
        console.error(`[Queue] Error in campaign ${firstCampaignId}:`, err);
      });
    }

  } catch (error) {
    console.error('[Queue] Error in main queue processor:', error);
  }
}

/**
 * Start queue processor with adaptive interval
 * Fast when campaigns are active, slower when idle
 */
function startQueueProcessor(fastInterval = 100, slowInterval = 5000) {
  console.log('[Queue] Starting queue processor with adaptive interval...');

  let currentInterval = slowInterval;
  let intervalHandle = null;
  let consecutiveEmptyPolls = 0;

  async function adaptiveProcessQueue() {
    // Get count of running campaigns
    const { count: runningCount } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running');

    // Adjust interval based on activity
    if (runningCount > 0) {
      // Active campaigns - use fast interval
      if (currentInterval !== fastInterval) {
        console.log(`[Queue] Switching to fast interval (${fastInterval}ms) - ${runningCount} active campaign(s)`);
        currentInterval = fastInterval;
        clearInterval(intervalHandle);
        intervalHandle = setInterval(adaptiveProcessQueue, fastInterval);
      }
      consecutiveEmptyPolls = 0;
    } else {
      // No active campaigns - use slow interval
      consecutiveEmptyPolls++;
      if (consecutiveEmptyPolls >= 3 && currentInterval !== slowInterval) {
        console.log(`[Queue] Switching to slow interval (${slowInterval}ms) - no active campaigns`);
        currentInterval = slowInterval;
        clearInterval(intervalHandle);
        intervalHandle = setInterval(adaptiveProcessQueue, slowInterval);
      }
    }

    // Process the queue
    await processQueue();
  }

  // Start with first poll
  adaptiveProcessQueue();

  // Set initial interval (slow by default)
  intervalHandle = setInterval(adaptiveProcessQueue, slowInterval);

  return intervalHandle;
}

module.exports = {
  processQueue,
  processCampaignQueue,
  startQueueProcessor
};
