const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { processAutoReply } = require('./llmService');

/**
 * Status hierarchy for messages
 * Higher values take precedence
 */
const STATUS_HIERARCHY = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 0 // Failed is special - always update to failed
};

/**
 * Verify Meta webhook signature using per-number app_secret
 * @param {string} signature - X-Hub-Signature-256 header value
 * @param {string} body - Raw request body
 * @param {string} phoneNumberId - WhatsApp Phone Number ID to identify which app_secret to use
 * @returns {Promise<boolean>}
 */
async function verifyWebhookSignature(signature, body, phoneNumberId) {
  if (!signature) {
    console.log('[Webhook] No signature provided');
    return false;
  }

  if (!phoneNumberId) {
    console.error('[Webhook] No phoneNumberId provided for signature verification');
    return false;
  }

  // Fetch app_secret from database for this specific phone number
  const { data: whatsappNumber, error } = await supabase
    .from('whatsapp_numbers')
    .select('app_secret')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    console.error('[Webhook] Error fetching app_secret:', error);
    return false;
  }

  if (!whatsappNumber || !whatsappNumber.app_secret) {
    // Fallback to global META_APP_SECRET for backward compatibility
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      console.error('[Webhook] No app_secret found for phone_number_id:', phoneNumberId);
      return false;
    }
    console.log('[Webhook] Using global META_APP_SECRET (fallback) for phone_number_id:', phoneNumberId);
  }

  const appSecret = whatsappNumber?.app_secret || process.env.META_APP_SECRET;

  // Remove 'sha256=' prefix if present
  const signatureHash = signature.startsWith('sha256=')
    ? signature.substring(7)
    : signature;

  // Calculate expected signature
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(body)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signatureHash),
    Buffer.from(expectedHash)
  );

  if (isValid) {
    console.log('[Webhook] ✅ Signature verified for phone_number_id:', phoneNumberId);
  } else {
    console.error('[Webhook] ❌ Signature verification failed for phone_number_id:', phoneNumberId);
  }

  return isValid;
}

/**
 * Check if message already exists (idempotency)
 * @param {string} whatsappMessageId
 * @returns {Promise<boolean>}
 */
async function messageExists(whatsappMessageId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id')
    .eq('whatsapp_message_id', whatsappMessageId)
    .maybeSingle();

  if (error) {
    console.error('[Webhook] Error checking message existence:', error);
    return false;
  }

  return data !== null;
}

/**
 * Check if we should update message status based on hierarchy
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {boolean}
 */
function shouldUpdateStatus(currentStatus, newStatus) {
  // Always update to failed
  if (newStatus === 'failed') {
    return true;
  }

  // Never downgrade from failed or read
  if (currentStatus === 'failed' || currentStatus === 'read') {
    return false;
  }

  // Check hierarchy
  const currentLevel = STATUS_HIERARCHY[currentStatus] || 0;
  const newLevel = STATUS_HIERARCHY[newStatus] || 0;

  return newLevel > currentLevel;
}

/**
 * Handle incoming message webhook
 * Stores message in database and triggers auto-reply
 */
async function handleIncomingMessage(messageData, whatsappNumberId, whatsappNumber) {
  try {
    const {
      from,
      id: whatsappMessageId,
      timestamp,
      type,
      text
    } = messageData;

    // Check idempotency
    const exists = await messageExists(whatsappMessageId);
    if (exists) {
      console.log(`[Webhook] Message ${whatsappMessageId} already exists, skipping`);
      return { success: true, duplicate: true };
    }

    // Insert incoming message
    const { data, error } = await supabase
      .from('messages')
      .insert({
        whatsapp_number_id: whatsappNumberId,
        user_phone: from,
        direction: 'incoming',
        message_type: type,
        message_body: text?.body || '',
        whatsapp_message_id: whatsappMessageId,
        status: 'received',
        created_at: new Date(parseInt(timestamp) * 1000).toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Webhook] Incoming message saved: ${whatsappMessageId} from ${from}`);

    // Trigger auto-reply (async, don't wait for completion)
    // This runs in background and failures are handled silently
    setImmediate(async () => {
      try {
        const incomingMessage = {
          user_phone: from,
          message_type: type,
          message_body: text?.body || ''
        };

        const result = await processAutoReply(incomingMessage, whatsappNumber);

        if (result.replied) {
          console.log(`[Webhook] ✅ Auto-reply sent to ${from}`);
        } else {
          console.log(`[Webhook] ⏭️  Auto-reply skipped for ${from}: ${result.reason}`);
        }
      } catch (error) {
        // Silent failure - already logged in LLM service
        console.error('[Webhook] Error in auto-reply background task:', error);
      }
    });

    return { success: true, duplicate: false, message: data };

  } catch (error) {
    console.error('[Webhook] Error handling incoming message:', error);
    throw error;
  }
}

/**
 * Handle status update webhook
 * Updates message status and creates status log
 */
async function handleStatusUpdate(statusData, whatsappNumberId) {
  try {
    const {
      id: whatsappMessageId,
      status,
      timestamp,
      recipient_id,
      errors
    } = statusData;

    // Map WhatsApp status to our status
    const mappedStatus = mapWhatsAppStatus(status);

    // Check if message exists
    const { data: existingMessage, error: fetchError } = await supabase
      .from('messages')
      .select('id, status, campaign_id, user_phone')
      .eq('whatsapp_message_id', whatsappMessageId)
      .maybeSingle();

    if (fetchError) {
      console.error('[Webhook] Error fetching message:', fetchError);
    }

    // Create status log (even if message doesn't exist yet - webhook might arrive before our insert)
    const statusLogData = {
      whatsapp_number_id: whatsappNumberId,
      whatsapp_message_id: whatsappMessageId,
      status: mappedStatus,
      user_phone: recipient_id,
      created_at: new Date(parseInt(timestamp) * 1000).toISOString()
    };

    // Add campaign_id if message exists
    if (existingMessage?.campaign_id) {
      statusLogData.campaign_id = existingMessage.campaign_id;
      statusLogData.message_id = existingMessage.id;
    }

    // Add error details if status is failed
    if (mappedStatus === 'failed' && errors && errors.length > 0) {
      const error = errors[0];
      statusLogData.error_code = error.code?.toString();
      statusLogData.error_message = error.title || error.message;
    }

    // Insert status log with UNIQUE constraint handling
    const { error: logError } = await supabase
      .from('message_status_logs')
      .insert(statusLogData)
      .select();

    if (logError) {
      // Check if it's a duplicate (UNIQUE constraint violation)
      if (logError.code === '23505') {
        console.log(`[Webhook] Duplicate status log for ${whatsappMessageId} - ${mappedStatus}, skipping`);
        return { success: true, duplicate: true };
      }
      console.error('[Webhook] Error creating status log:', logError);
    }

    // Update message status if exists and hierarchy allows
    if (existingMessage) {
      if (shouldUpdateStatus(existingMessage.status, mappedStatus)) {
        const { error: updateError } = await supabase
          .from('messages')
          .update({ status: mappedStatus })
          .eq('id', existingMessage.id);

        if (updateError) {
          console.error('[Webhook] Error updating message status:', updateError);
        } else {
          console.log(`[Webhook] Updated message ${whatsappMessageId}: ${existingMessage.status} → ${mappedStatus}`);
        }
      } else {
        console.log(`[Webhook] Status update skipped for ${whatsappMessageId}: ${existingMessage.status} (current) vs ${mappedStatus} (new)`);
      }
    }

    return { success: true, duplicate: false };

  } catch (error) {
    console.error('[Webhook] Error handling status update:', error);
    throw error;
  }
}

/**
 * Map WhatsApp status to our internal status
 */
function mapWhatsAppStatus(whatsappStatus) {
  const statusMap = {
    'sent': 'sent',
    'delivered': 'delivered',
    'read': 'read',
    'failed': 'failed'
  };

  return statusMap[whatsappStatus] || 'sent';
}

/**
 * Process webhook entry
 * Handles both messages and statuses
 */
async function processWebhookEntry(entry) {
  try {
    const changes = entry.changes || [];

    for (const change of changes) {
      const value = change.value;

      if (!value) continue;

      // Get WhatsApp number info
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) {
        console.log('[Webhook] No phone_number_id in webhook, skipping');
        continue;
      }

      // Find WhatsApp number in database
      // Fetch all fields needed for auto-reply
      const { data: whatsappNumber, error: numberError } = await supabase
        .from('whatsapp_numbers')
        .select('id, phone_number_id, access_token, system_prompt')
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();

      if (numberError || !whatsappNumber) {
        console.log(`[Webhook] WhatsApp number not found for phone_number_id: ${phoneNumberId}`);
        continue;
      }

      // Handle incoming messages
      if (value.messages && value.messages.length > 0) {
        for (const message of value.messages) {
          await handleIncomingMessage(message, whatsappNumber.id, whatsappNumber);
        }
      }

      // Handle status updates
      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status, whatsappNumber.id);
        }
      }
    }

    return { success: true };

  } catch (error) {
    console.error('[Webhook] Error processing entry:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  verifyWebhookSignature,
  messageExists,
  shouldUpdateStatus,
  handleIncomingMessage,
  handleStatusUpdate,
  processWebhookEntry,
  STATUS_HIERARCHY
};
