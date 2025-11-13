const { supabase } = require('../config/supabase');
const { sendTextMessage, sendTemplateMessage } = require('../services/whatsappService');

/**
 * Get all conversations grouped by user_phone
 * Returns list of conversations with last message and reply count
 * OPTIMIZED: Uses pagination and efficient aggregation queries
 *
 * Query params:
 * - whatsapp_number_id: Filter by WhatsApp number (optional)
 * - search: Search in user_phone or message_body (optional)
 * - limit: Max conversations to return (default: 50)
 * - offset: Pagination offset (default: 0)
 */
exports.getConversations = async (req, res) => {
  try {
    const {
      whatsapp_number_id,
      search,
      limit = 50,
      offset = 0
    } = req.query;

    // Use optimized SQL query with aggregation
    let rpcParams = {
      p_limit: parseInt(limit),
      p_offset: parseInt(offset)
    };

    if (whatsapp_number_id) {
      rpcParams.p_whatsapp_number_id = whatsapp_number_id;
    }

    if (search) {
      rpcParams.p_search = search;
    }

    // Use fallback query directly (optimized RPC function can be added later)
    console.log('[Messages] Using fallback query');
    const fallbackResult = await getFallbackConversations(whatsapp_number_id, search, limit, offset);

    if (fallbackResult.error) {
      throw fallbackResult.error;
    }

    const conversations = fallbackResult.data;

    // Fetch WhatsApp numbers in bulk
    const whatsappNumberIds = [...new Set(conversations.map(c => c.whatsapp_number_id))];
    const { data: whatsappNumbers } = await supabase
      .from('whatsapp_numbers')
      .select('id, display_name, number')
      .in('id', whatsappNumberIds);

    const whatsappNumberMap = {};
    (whatsappNumbers || []).forEach(wn => {
      whatsappNumberMap[wn.id] = wn;
    });

    // Fetch reply limits in bulk
    const userPhones = conversations.map(c => c.user_phone);
    const { data: replyLimits } = await supabase
      .from('user_reply_limits')
      .select('user_phone, reply_count, last_reply_at')
      .in('user_phone', userPhones);

    const replyLimitMap = {};
    (replyLimits || []).forEach(rl => {
      replyLimitMap[rl.user_phone] = rl;
    });

    // Enrich conversations with data
    const enrichedConversations = conversations.map(conv => {
      const whatsappNumber = whatsappNumberMap[conv.whatsapp_number_id];
      const replyLimit = replyLimitMap[conv.user_phone];

      return {
        user_phone: conv.user_phone,
        whatsapp_number_id: conv.whatsapp_number_id,
        whatsapp_number_display: whatsappNumber?.display_name || whatsappNumber?.number,
        last_message: {
          id: conv.id,
          message_body: conv.message_body,
          message_type: conv.message_type,
          direction: conv.direction,
          created_at: conv.created_at,
          status: conv.status
        },
        total_messages: conv.total_messages || 1,
        unread_count: conv.unread_count || 0,
        reply_count: replyLimit?.reply_count || 0,
        reply_limit_reached: (replyLimit?.reply_count || 0) >= 40,
        last_reply_at: replyLimit?.last_reply_at
      };
    });

    res.json({
      success: true,
      data: enrichedConversations,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: enrichedConversations.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('[Messages] Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch conversations'
    });
  }
};

/**
 * Fallback function for conversations when optimized query fails
 */
async function getFallbackConversations(whatsappNumberId, search, limit, offset) {
  let query = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(parseInt(limit) * 10); // Get more to account for duplicates

  if (whatsappNumberId) {
    query = query.eq('whatsapp_number_id', whatsappNumberId);
  }

  if (search) {
    query = query.ilike('user_phone', `%${search}%`);
  }

  const { data: messages, error } = await query;

  if (error) {
    throw error;
  }

  // Group by conversation and track if customer has replied
  const conversationMap = {};
  const hasIncomingMessage = {}; // Track which conversations have incoming messages

  messages.forEach(msg => {
    const key = `${msg.whatsapp_number_id}_${msg.user_phone}`;

    // Track if this conversation has any incoming messages (customer replied)
    if (msg.direction === 'incoming') {
      hasIncomingMessage[key] = true;
    }

    if (!conversationMap[key]) {
      conversationMap[key] = {
        ...msg,
        total_messages: 1,
        unread_count: msg.direction === 'incoming' ? 1 : 0
      };
    } else {
      conversationMap[key].total_messages++;
      if (msg.direction === 'incoming') {
        conversationMap[key].unread_count++;
      }
    }
  });

  // Filter: Only include conversations where customer has sent at least one incoming message
  const conversationsWithReplies = Object.entries(conversationMap)
    .filter(([key, conv]) => hasIncomingMessage[key]) // Only show if customer replied
    .map(([key, conv]) => conv);

  // Sort conversations by latest message timestamp (descending)
  const conversations = conversationsWithReplies
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  return { data: conversations, error: null };
}

/**
 * Get all messages for a specific conversation
 *
 * URL params:
 * - whatsapp_number_id: WhatsApp number ID
 * - user_phone: Customer phone number
 *
 * Query params:
 * - limit: Max messages to return (default: 100)
 * - offset: Pagination offset (default: 0)
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const { whatsapp_number_id, user_phone } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    // Validate required params
    if (!whatsapp_number_id || !user_phone) {
      return res.status(400).json({
        success: false,
        error: 'whatsapp_number_id and user_phone are required'
      });
    }

    // Get messages
    const { data: messages, error: messagesError, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('whatsapp_number_id', whatsapp_number_id)
      .eq('user_phone', user_phone)
      .order('created_at', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (messagesError) throw messagesError;

    // Get reply limit info
    const { data: replyLimit } = await supabase
      .from('user_reply_limits')
      .select('reply_count, last_reply_at')
      .eq('user_phone', user_phone)
      .maybeSingle();

    // Get WhatsApp number details
    const { data: whatsappNumber } = await supabase
      .from('whatsapp_numbers')
      .select('display_name, number, system_prompt')
      .eq('id', whatsapp_number_id)
      .single();

    res.json({
      success: true,
      data: {
        messages: messages || [],
        total_count: count,
        user_phone,
        whatsapp_number: whatsappNumber,
        reply_count: replyLimit?.reply_count || 0,
        reply_limit_reached: (replyLimit?.reply_count || 0) >= 40,
        last_reply_at: replyLimit?.last_reply_at
      }
    });

  } catch (error) {
    console.error('[Messages] Error fetching conversation messages:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch conversation messages'
    });
  }
};

/**
 * Search messages across all conversations
 *
 * Query params:
 * - q: Search query (required)
 * - whatsapp_number_id: Filter by WhatsApp number (optional)
 * - limit: Max results (default: 50)
 */
exports.searchMessages = async (req, res) => {
  try {
    const { q, whatsapp_number_id, limit = 50 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    let query = supabase
      .from('messages')
      .select('*')
      .ilike('message_body', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (whatsapp_number_id) {
      query = query.eq('whatsapp_number_id', whatsapp_number_id);
    }

    const { data: messages, error } = await query;

    if (error) throw error;

    // Enrich with WhatsApp number info
    const enrichedMessages = await Promise.all(
      messages.map(async (msg) => {
        const { data: whatsappNumber } = await supabase
          .from('whatsapp_numbers')
          .select('display_name, number')
          .eq('id', msg.whatsapp_number_id)
          .maybeSingle();

        return {
          ...msg,
          whatsapp_number_display: whatsappNumber?.display_name || whatsappNumber?.number
        };
      })
    );

    res.json({
      success: true,
      data: {
        messages: enrichedMessages,
        query: q,
        count: enrichedMessages.length
      }
    });

  } catch (error) {
    console.error('[Messages] Error searching messages:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search messages'
    });
  }
};

/**
 * Get conversation stats
 * Returns overall statistics for inbox
 */
exports.getConversationStats = async (req, res) => {
  try {
    // Total conversations (only those where customer has replied)
    const { data: allMessages } = await supabase
      .from('messages')
      .select('user_phone, whatsapp_number_id, direction');

    // Group by conversation and check if customer has replied
    const conversationsWithReplies = new Set();
    allMessages?.forEach(m => {
      if (m.direction === 'incoming') {
        conversationsWithReplies.add(`${m.whatsapp_number_id}_${m.user_phone}`);
      }
    });

    // Total messages
    const { count: totalMessages } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true });

    // Incoming messages
    const { count: incomingCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'incoming');

    // Outgoing messages
    const { count: outgoingCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'outgoing');

    // Users who hit reply limit
    const { count: limitReachedCount } = await supabase
      .from('user_reply_limits')
      .select('user_phone', { count: 'exact', head: true })
      .gte('reply_count', 40);

    res.json({
      success: true,
      data: {
        total_conversations: conversationsWithReplies.size,
        total_messages: totalMessages || 0,
        incoming_messages: incomingCount || 0,
        outgoing_messages: outgoingCount || 0,
        users_at_reply_limit: limitReachedCount || 0
      }
    });

  } catch (error) {
    console.error('[Messages] Error fetching conversation stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch conversation stats'
    });
  }
};

/**
 * Send a text message to a user
 * POST /api/messages/send-text
 * Body: { whatsapp_number_id, user_phone, text }
 */
exports.sendText = async (req, res) => {
  try {
    const { whatsapp_number_id, user_phone, text } = req.body;

    // Validate inputs
    if (!whatsapp_number_id || !user_phone || !text) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: whatsapp_number_id, user_phone, text'
      });
    }

    // Get WhatsApp number details
    const { data: whatsappNumber, error: numError } = await supabase
      .from('whatsapp_numbers')
      .select('phone_number_id, access_token')
      .eq('id', whatsapp_number_id)
      .single();

    if (numError || !whatsappNumber) {
      return res.status(404).json({
        success: false,
        error: 'WhatsApp number not found'
      });
    }

    // Send text message via WhatsApp API
    const result = await sendTextMessage(
      whatsappNumber.phone_number_id,
      whatsappNumber.access_token,
      user_phone,
      text
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Save message to database
    const { data: message, error: saveError } = await supabase
      .from('messages')
      .insert({
        whatsapp_number_id,
        user_phone,
        direction: 'outgoing',
        message_type: 'text',
        message_body: text,
        whatsapp_message_id: result.messageId,
        status: 'sent',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (saveError) {
      console.error('[Messages] Error saving sent message:', saveError);
    }

    res.json({
      success: true,
      data: {
        message_id: result.messageId,
        message: message
      }
    });

  } catch (error) {
    console.error('[Messages] Error sending text message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send text message'
    });
  }
};

/**
 * Send a template message to a user
 * POST /api/messages/send-template
 * Body: { whatsapp_number_id, user_phone, template_id, variables }
 */
exports.sendTemplate = async (req, res) => {
  try {
    const { whatsapp_number_id, user_phone, template_id, variables = {} } = req.body;

    // Validate inputs
    if (!whatsapp_number_id || !user_phone || !template_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: whatsapp_number_id, user_phone, template_id'
      });
    }

    // Get WhatsApp number details
    const { data: whatsappNumber, error: numError } = await supabase
      .from('whatsapp_numbers')
      .select('phone_number_id, access_token')
      .eq('id', whatsapp_number_id)
      .single();

    if (numError || !whatsappNumber) {
      return res.status(404).json({
        success: false,
        error: 'WhatsApp number not found'
      });
    }

    // Get template details
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', template_id)
      .eq('whatsapp_number_id', whatsapp_number_id)
      .single();

    if (templateError || !template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Check template is active and not MARKETING
    if (!template.is_active || template.category === 'MARKETING') {
      return res.status(400).json({
        success: false,
        error: 'Template is not available for use (inactive or MARKETING category)'
      });
    }

    // Send template message via WhatsApp API with variables
    const result = await sendTemplateMessage(
      whatsappNumber.phone_number_id,
      whatsappNumber.access_token,
      user_phone,
      template.name,
      template.language,
      variables, // Pass variables from request
      template.components || []
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Save message to database
    const { data: message, error: saveError } = await supabase
      .from('messages')
      .insert({
        whatsapp_number_id,
        user_phone,
        direction: 'outgoing',
        message_type: 'template',
        message_body: null, // Templates don't have simple body text
        whatsapp_message_id: result.messageId,
        status: 'sent',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (saveError) {
      console.error('[Messages] Error saving sent template:', saveError);
    }

    res.json({
      success: true,
      data: {
        message_id: result.messageId,
        message: message
      }
    });

  } catch (error) {
    console.error('[Messages] Error sending template message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send template message'
    });
  }
};
