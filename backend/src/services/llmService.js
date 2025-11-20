const OpenAI = require('openai');
const { supabase } = require('../config/supabase');
const { sendTemplateMessage } = require('./whatsappService');

/**
 * Maximum LLM replies per customer phone number (lifetime limit)
 */
const MAX_REPLIES_PER_USER = 40;

/**
 * Number of previous messages to include in context
 */
const CONTEXT_MESSAGE_COUNT = 10;

/**
 * Get OpenAI client instance with settings from database
 * Falls back to environment variables if not configured in DB
 */
async function getOpenAIClient() {
  try {
    // Get LLM settings from database
    const { data: settings, error } = await supabase
      .from('global_llm_settings')
      .select('api_key, model_name, temperature, max_tokens')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[LLM] Error fetching settings:', error);
    }

    // Use database settings if available, otherwise fall back to env
    const apiKey = settings?.api_key || process.env.OPENAI_API_KEY;
    const modelName = settings?.model_name || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temperature = settings?.temperature || 0.7;
    const maxTokens = settings?.max_tokens || 512;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured in database or environment');
    }

    return {
      client: new OpenAI({ apiKey }),
      config: {
        model: modelName,
        temperature: temperature,
        max_tokens: maxTokens
      }
    };
  } catch (error) {
    console.error('[LLM] Error initializing OpenAI client:', error);
    throw error;
  }
}

/**
 * Check if user has reached reply limit
 * Returns current reply count and whether limit is reached
 */
async function checkReplyLimit(userPhone) {
  try {
    const { data, error } = await supabase
      .from('user_reply_limits')
      .select('reply_count')
      .eq('user_phone', userPhone)
      .maybeSingle();

    if (error) {
      console.error('[LLM] Error checking reply limit:', error);
      return { count: 0, limitReached: false };
    }

    const currentCount = data?.reply_count || 0;
    const limitReached = currentCount >= MAX_REPLIES_PER_USER;

    return { count: currentCount, limitReached };

  } catch (error) {
    console.error('[LLM] Error in checkReplyLimit:', error);
    return { count: 0, limitReached: false };
  }
}

/**
 * Increment reply count for user
 * Creates record if doesn't exist
 */
async function incrementReplyCount(userPhone) {
  try {
    // Try to update existing record
    const { data: existing } = await supabase
      .from('user_reply_limits')
      .select('reply_count')
      .eq('user_phone', userPhone)
      .maybeSingle();

    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('user_reply_limits')
        .update({
          reply_count: existing.reply_count + 1,
          last_reply_at: new Date().toISOString()
        })
        .eq('user_phone', userPhone);

      if (error) throw error;

      console.log(`[LLM] Incremented reply count for ${userPhone}: ${existing.reply_count + 1}`);
      return existing.reply_count + 1;

    } else {
      // Create new record
      const { error } = await supabase
        .from('user_reply_limits')
        .insert({
          user_phone: userPhone,
          reply_count: 1,
          last_reply_at: new Date().toISOString()
        });

      if (error) throw error;

      console.log(`[LLM] Created reply limit record for ${userPhone}`);
      return 1;
    }

  } catch (error) {
    console.error('[LLM] Error incrementing reply count:', error);
    throw error;
  }
}

/**
 * Fetch last N messages for context
 * Returns messages in chronological order (oldest first)
 */
async function fetchConversationContext(whatsappNumberId, userPhone, limit = CONTEXT_MESSAGE_COUNT) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('direction, message_body, created_at')
      .eq('whatsapp_number_id', whatsappNumberId)
      .eq('user_phone', userPhone)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Reverse to get chronological order (oldest first)
    return (data || []).reverse();

  } catch (error) {
    console.error('[LLM] Error fetching conversation context:', error);
    return [];
  }
}

/**
 * Build messages array for OpenAI Chat API
 */
function buildChatMessages(systemPrompt, conversationHistory) {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Add conversation history
  conversationHistory.forEach(msg => {
    messages.push({
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: msg.message_body || ''
    });
  });

  return messages;
}

/**
 * Generate LLM reply using OpenAI
 */
async function generateReply(systemPrompt, conversationHistory) {
  try {
    const { client, config } = await getOpenAIClient();

    const messages = buildChatMessages(systemPrompt, conversationHistory);

    console.log(`[LLM] Generating reply with ${conversationHistory.length} context messages using ${config.model}`);

    const completion = await client.chat.completions.create({
      model: config.model,
      messages: messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens
    });

    const reply = completion.choices[0]?.message?.content;

    if (!reply) {
      throw new Error('No reply generated from OpenAI');
    }

    console.log(`[LLM] Generated reply: ${reply.substring(0, 100)}...`);
    return reply;

  } catch (error) {
    console.error('[LLM] Error generating reply:', error);
    throw error;
  }
}

/**
 * Send WhatsApp text message
 */
async function sendWhatsAppTextMessage(whatsappNumber, toPhone, messageText) {
  try {
    const { phone_number_id, access_token } = whatsappNumber;

    const axios = require('axios');
    const response = await axios.post(
      `https://graph.facebook.com/v24.0/${phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: {
          body: messageText
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const messageId = response.data.messages?.[0]?.id;
    console.log(`[LLM] Sent WhatsApp message: ${messageId}`);

    return {
      success: true,
      whatsapp_message_id: messageId
    };

  } catch (error) {
    console.error('[LLM] Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Save outgoing LLM reply to database
 */
async function saveOutgoingMessage(whatsappNumberId, userPhone, messageText, whatsappMessageId) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        whatsapp_number_id: whatsappNumberId,
        user_phone: userPhone,
        direction: 'outgoing',
        message_type: 'text',
        message_body: messageText,
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[LLM] Saved outgoing message to database`);
    return data;

  } catch (error) {
    console.error('[LLM] Error saving outgoing message:', error);
    throw error;
  }
}

/**
 * Process auto-reply for incoming message
 * This is the main entry point called from webhook handler
 *
 * Returns:
 * - { replied: true, reason: 'success' } if reply sent
 * - { replied: false, reason: 'limit_reached' } if 40 limit reached
 * - { replied: false, reason: 'not_supported_type' } if message type is not supported
 * - { replied: false, reason: 'error', error: ... } if error occurred
 */
async function processAutoReply(incomingMessage, whatsappNumber) {
  try {
    const { user_phone, message_type, message_body, interactive } = incomingMessage;
    const whatsappNumberId = whatsappNumber.id;

    // Only reply to text messages, interactive button/list replies, and button messages
    const isTextMessage = message_type === 'text';
    const isInteractiveReply = message_type === 'interactive' &&
                               interactive?.type &&
                               (interactive.type === 'button_reply' || interactive.type === 'list_reply');
    const isButtonMessage = message_type === 'button';

    if (!isTextMessage && !isInteractiveReply && !isButtonMessage) {
      console.log(`[LLM] Skipping auto-reply for ${user_phone}: message type is ${message_type}${message_type === 'interactive' ? ` (${interactive?.type})` : ''}`);
      return { replied: false, reason: 'not_supported_type' };
    }

    // Validate message body exists
    if (!message_body || message_body.trim() === '') {
      console.log(`[LLM] Skipping auto-reply for ${user_phone}: empty message body`);
      return { replied: false, reason: 'empty_message' };
    }

    // Check reply limit
    const { count, limitReached } = await checkReplyLimit(user_phone);
    if (limitReached) {
      console.log(`[LLM] Skipping auto-reply for ${user_phone}: limit reached (${count}/${MAX_REPLIES_PER_USER})`);
      return { replied: false, reason: 'limit_reached', count };
    }

    console.log(`[LLM] Processing auto-reply for ${user_phone} (${count}/${MAX_REPLIES_PER_USER} replies used)`);

    // Fetch conversation context (last 10 messages)
    const conversationHistory = await fetchConversationContext(
      whatsappNumberId,
      user_phone,
      CONTEXT_MESSAGE_COUNT
    );

    // Get system prompt from WhatsApp number
    const systemPrompt = whatsappNumber.system_prompt ||
      'You are a helpful customer support assistant. Be friendly, concise, and helpful.';

    // Generate reply using OpenAI
    const replyText = await generateReply(systemPrompt, conversationHistory);

    // Send reply via WhatsApp
    const sendResult = await sendWhatsAppTextMessage(
      whatsappNumber,
      user_phone,
      replyText
    );

    // Save outgoing message to database
    await saveOutgoingMessage(
      whatsappNumberId,
      user_phone,
      replyText,
      sendResult.whatsapp_message_id
    );

    // Increment reply count
    const newCount = await incrementReplyCount(user_phone);

    console.log(`[LLM] ✅ Auto-reply sent successfully to ${user_phone} (${newCount}/${MAX_REPLIES_PER_USER})`);

    return {
      replied: true,
      reason: 'success',
      count: newCount,
      reply_text: replyText
    };

  } catch (error) {
    // Silent failure - log error but don't throw
    console.error('[LLM] ❌ Error in auto-reply (silent failure):', error);
    return {
      replied: false,
      reason: 'error',
      error: error.message
    };
  }
}

module.exports = {
  processAutoReply,
  checkReplyLimit,
  incrementReplyCount,
  fetchConversationContext,
  generateReply,
  MAX_REPLIES_PER_USER,
  CONTEXT_MESSAGE_COUNT
};
