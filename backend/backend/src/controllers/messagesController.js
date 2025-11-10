const { supabase } = require('../config/supabase');

/**
 * Get all conversations grouped by user_phone
 * Returns list of conversations with last message and reply count
 *
 * Query params:
 * - whatsapp_number_id: Filter by WhatsApp number (optional)
 * - search: Search in user_phone or message_body (optional)
 * - start_date: Filter from date (optional, ISO format)
 * - end_date: Filter to date (optional, ISO format)
 */
exports.getConversations = async (req, res) => {
  try {
    const {
      whatsapp_number_id,
      search,
      start_date,
      end_date
    } = req.query;

    // Build base query for distinct user_phone numbers
    let query = supabase
      .from('messages')
      .select('user_phone, whatsapp_number_id')
      .order('created_at', { ascending: false });

    // Apply filters
    if (whatsapp_number_id) {
      query = query.eq('whatsapp_number_id', whatsapp_number_id);
    }

    if (start_date) {
      query = query.gte('created_at', start_date);
    }

    if (end_date) {
      query = query.lte('created_at', end_date);
    }

    if (search) {
      query = query.or(`user_phone.ilike.%${search}%,message_body.ilike.%${search}%`);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) throw messagesError;

    // Group by user_phone and get unique conversations
    const uniqueConversations = {};
    messages.forEach(msg => {
      const key = `${msg.whatsapp_number_id}_${msg.user_phone}`;
      if (!uniqueConversations[key]) {
        uniqueConversations[key] = {
          user_phone: msg.user_phone,
          whatsapp_number_id: msg.whatsapp_number_id
        };
      }
    });

    // For each conversation, get last message and counts
    const conversations = await Promise.all(
      Object.values(uniqueConversations).map(async (conv) => {
        // Get last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('whatsapp_number_id', conv.whatsapp_number_id)
          .eq('user_phone', conv.user_phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get message counts
        const { data: counts } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: false })
          .eq('whatsapp_number_id', conv.whatsapp_number_id)
          .eq('user_phone', conv.user_phone);

        // Get unread count (incoming messages without corresponding outgoing)
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: false })
          .eq('whatsapp_number_id', conv.whatsapp_number_id)
          .eq('user_phone', conv.user_phone)
          .eq('direction', 'incoming');

        // Get reply limit info
        const { data: replyLimit } = await supabase
          .from('user_reply_limits')
          .select('reply_count, last_reply_at')
          .eq('user_phone', conv.user_phone)
          .maybeSingle();

        // Get WhatsApp number details
        const { data: whatsappNumber } = await supabase
          .from('whatsapp_numbers')
          .select('display_name, number')
          .eq('id', conv.whatsapp_number_id)
          .single();

        return {
          user_phone: conv.user_phone,
          whatsapp_number_id: conv.whatsapp_number_id,
          whatsapp_number_display: whatsappNumber?.display_name || whatsappNumber?.number,
          last_message: lastMessage,
          total_messages: counts?.length || 0,
          unread_count: unreadMessages?.length || 0,
          reply_count: replyLimit?.reply_count || 0,
          reply_limit_reached: (replyLimit?.reply_count || 0) >= 40,
          last_reply_at: replyLimit?.last_reply_at
        };
      })
    );

    // Sort by last message time
    conversations.sort((a, b) => {
      const timeA = new Date(a.last_message?.created_at || 0);
      const timeB = new Date(b.last_message?.created_at || 0);
      return timeB - timeA;
    });

    res.json({
      success: true,
      data: conversations
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
    // Total conversations (distinct user_phone)
    const { data: allMessages } = await supabase
      .from('messages')
      .select('user_phone, whatsapp_number_id');

    const uniqueConversations = new Set(
      allMessages?.map(m => `${m.whatsapp_number_id}_${m.user_phone}`) || []
    );

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
        total_conversations: uniqueConversations.size,
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
