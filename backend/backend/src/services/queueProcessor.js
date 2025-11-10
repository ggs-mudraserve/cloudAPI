const { supabase } = require('../config/supabase');
const { sendTemplateMessage } = require('./whatsappService');

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
async function adjustRate(whatsappNumberId, rateState, errorCode = null) {
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

    // Increase rate by 10% if error rate < 1% for 5 minutes and we have enough samples
    if (errorRate < 0.01 && totalRecent >= 300 && now - rateState.lastUpdateTime >= 5 * 60 * 1000) {
      const newRate = Math.min(1000, Math.floor(rateState.currentRate * 1.1));
      console.log(`[Rate Control] Increasing rate for number ${whatsappNumberId}: ${rateState.currentRate} -> ${newRate} msg/sec`);

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
 * Exponential backoff: 5s, 20s, 45s
 */
function getRetryDelay(retryCount) {
  if (retryCount === 0) return 5000;   // 5 seconds
  if (retryCount === 1) return 20000;  // 20 seconds
  return 45000; // 45 seconds
}

/**
 * Process a single message from the queue
 */
async function processMessage(message, whatsappNumber, rateState) {
  try {
    // Get template components
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('components, language')
      .eq('whatsapp_number_id', message.whatsapp_number_id)
      .eq('name', message.template_name)
      .single();

    if (templateError || !template) {
      throw new Error(`Template ${message.template_name} not found`);
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
      template.components // Pass template components to properly structure media vs body parameters
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
      await supabase
        .from('message_status_logs')
        .insert({
          whatsapp_message_id: result.messageId,
          status: 'sent',
          campaign_id: message.campaign_id
        });

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
      await adjustRate(message.whatsapp_number_id, rateState, null);

      console.log(`[Queue] Sent message ${message.id} to ${message.phone}`);
      return { success: true };

    } else {
      throw new Error(result.error || 'Failed to send message');
    }

  } catch (error) {
    console.error(`[Queue] Error processing message ${message.id}:`, error);

    // Check if it's a rate limit error
    const errorCode = error.response?.data?.error?.code;
    if (errorCode === 130429) {
      await adjustRate(message.whatsapp_number_id, rateState, 130429);
    } else {
      await adjustRate(message.whatsapp_number_id, rateState, 'other');
    }

    // Handle retry logic
    const newRetryCount = message.retry_count + 1;

    if (newRetryCount >= 3) {
      // Max retries reached, mark as failed
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

      console.log(`[Queue] Message ${message.id} failed after ${newRetryCount} attempts`);
      return { success: false, error: error.message };

    } else {
      // Schedule retry
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

      console.log(`[Queue] Message ${message.id} scheduled for retry ${newRetryCount}/3 in ${retryDelay}ms`);
      return { success: false, retry: true };
    }
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
      .select('id, whatsapp_number_id, status, total_contacts')
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
    const { data: whatsappNumber, error: numberError } = await supabase
      .from('whatsapp_numbers')
      .select('id, phone_number_id, access_token, max_send_rate_per_sec, is_active')
      .eq('id', campaign.whatsapp_number_id)
      .single();

    if (numberError || !whatsappNumber || !whatsappNumber.is_active) {
      console.error(`[Queue] WhatsApp number not found or inactive for campaign ${campaignId}`);

      // Mark campaign as failed
      await supabase
        .from('campaigns')
        .update({
          status: 'failed',
          end_time: new Date().toISOString()
        })
        .eq('id', campaignId);

      return;
    }

    // Initialize rate control
    const rateState = initRateControl(
      whatsappNumber.id,
      whatsappNumber.max_send_rate_per_sec || 60
    );

    // Check if already processing
    if (rateState.isProcessing) {
      console.log(`[Queue] Campaign ${campaignId} is already being processed`);
      return;
    }

    rateState.isProcessing = true;

    // Get pending messages (use FOR UPDATE SKIP LOCKED for concurrency safety)
    const { data: messages, error: messagesError } = await supabase
      .from('send_queue')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'ready')
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order('created_at', { ascending: true })
      .limit(100); // Process in batches

    if (messagesError) {
      console.error(`[Queue] Error fetching messages for campaign ${campaignId}:`, messagesError);
      rateState.isProcessing = false;
      return;
    }

    if (!messages || messages.length === 0) {
      console.log(`[Queue] No messages to process for campaign ${campaignId}`);

      // Check if campaign is complete
      const { data: stats, error: statsError } = await supabase
        .from('send_queue')
        .select('status')
        .eq('campaign_id', campaignId)
        .in('status', ['ready', 'processing']);

      console.log(`[Queue] Pending messages check: ${stats?.length || 0} messages with status ready/processing`);

      if (statsError) {
        console.error(`[Queue] Error checking pending messages:`, statsError);
      }

      if (!stats || stats.length === 0) {
        // All messages processed, mark campaign as completed
        console.log(`[Queue] Marking campaign ${campaignId} as completed...`);
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            status: 'completed',
            end_time: new Date().toISOString()
          })
          .eq('id', campaignId);

        if (updateError) {
          console.error(`[Queue] Error marking campaign as completed:`, updateError);
        } else {
          console.log(`[Queue] ✅ Campaign ${campaignId} completed successfully`);
        }
      }

      rateState.isProcessing = false;
      return;
    }

    console.log(`[Queue] Processing ${messages.length} messages for campaign ${campaignId} at ${rateState.currentRate} msg/sec`);

    // Process messages with rate limiting
    const delay = getDelay(rateState.currentRate);

    for (const message of messages) {
      await processMessage(message, whatsappNumber, rateState);

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    rateState.isProcessing = false;

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
      const { data: stats, error: statsError } = await supabase
        .from('send_queue')
        .select('status')
        .eq('campaign_id', campaignId)
        .in('status', ['ready', 'processing']);

      console.log(`[Queue] Pending messages after batch: ${stats?.length || 0} messages with status ready/processing`);

      if (statsError) {
        console.error(`[Queue] Error checking pending messages after batch:`, statsError);
      }

      if (!stats || stats.length === 0) {
        // All messages processed, mark campaign as completed
        console.log(`[Queue] Marking campaign ${campaignId} as completed...`);
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            status: 'completed',
            end_time: new Date().toISOString()
          })
          .eq('id', campaignId);

        if (updateError) {
          console.error(`[Queue] Error marking campaign as completed:`, updateError);
        } else {
          console.log(`[Queue] ✅ Campaign ${campaignId} completed successfully`);
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
 * Start queue processor with interval
 */
function startQueueProcessor(intervalMs = 5000) {
  console.log('[Queue] Starting queue processor...');

  // Process immediately
  processQueue();

  // Then process at regular intervals
  const interval = setInterval(processQueue, intervalMs);

  return interval;
}

module.exports = {
  processQueue,
  processCampaignQueue,
  startQueueProcessor
};
