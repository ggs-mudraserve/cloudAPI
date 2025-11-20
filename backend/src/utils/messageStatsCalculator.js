/**
 * Standardized Message Status Calculator
 *
 * Following WhatsApp Cloud API best practices:
 * 1. Count by unique whatsapp_message_id (WAMID), not by webhook count
 * 2. Handle multi-device scenarios (multiple webhooks for same message)
 * 3. Use status hierarchy to prevent downgrades
 * 4. Handle out-of-order webhook delivery
 * 5. Treat "delivered" + "read" as "at least delivered"
 *
 * Based on Meta's official documentation and industry standards.
 */

const { supabase } = require('../config/supabase');

/**
 * Status hierarchy for message progression
 * Higher values take precedence
 *
 * Special rule: If "delivered" or "read" exists, ignore subsequent "failed"
 * (multi-device scenario: failed on one device, delivered on another)
 */
const STATUS_HIERARCHY = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 0 // Lowest priority, but can override if no higher status exists
};

/**
 * Fetch all status logs for given campaign IDs with pagination
 * @param {string[]} campaignIds - Array of campaign IDs
 * @returns {Promise<Array>} All status logs
 */
async function fetchAllStatusLogs(campaignIds) {
  if (!campaignIds || campaignIds.length === 0) {
    return [];
  }

  let allLogs = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('message_status_logs')
      .select('whatsapp_message_id, status, created_at, campaign_id, message_id')
      .in('campaign_id', campaignIds)
      .order('id', { ascending: true }) // CRITICAL: Order by primary key for consistent pagination
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('[MessageStats] Error fetching status logs:', error);
      throw error;
    }

    if (batch && batch.length > 0) {
      allLogs = allLogs.concat(batch);
      from += batchSize;
      hasMore = batch.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allLogs;
}

/**
 * Fetch all outgoing campaign messages with pagination
 * @param {string[]} campaignIds - Array of campaign IDs
 * @returns {Promise<Array>} All campaign messages
 */
async function fetchAllCampaignMessages(campaignIds) {
  if (!campaignIds || campaignIds.length === 0) {
    return [];
  }

  let allMessages = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('messages')
      .select('whatsapp_message_id, user_phone, whatsapp_number_id, campaign_id')
      .in('campaign_id', campaignIds)
      .eq('direction', 'outgoing')
      .order('id', { ascending: true }) // CRITICAL: Order by primary key for consistent pagination
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('[MessageStats] Error fetching campaign messages:', error);
      throw error;
    }

    if (batch && batch.length > 0) {
      allMessages = allMessages.concat(batch);
      from += batchSize;
      hasMore = batch.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allMessages;
}

/**
 * Fetch all incoming messages (replies) with pagination
 * @param {Set} campaignUsers - Set of "whatsapp_number_id_user_phone" strings
 * @returns {Promise<Set>} Set of unique repliers
 */
async function fetchAllReplies(campaignUsers) {
  if (!campaignUsers || campaignUsers.size === 0) {
    return new Set();
  }

  let allIncoming = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('messages')
      .select('user_phone, whatsapp_number_id')
      .eq('direction', 'incoming')
      .order('id', { ascending: true }) // CRITICAL: Order by primary key for consistent pagination
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('[MessageStats] Error fetching incoming messages:', error);
      throw error;
    }

    if (batch && batch.length > 0) {
      allIncoming = allIncoming.concat(batch);
      from += batchSize;
      hasMore = batch.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  // Filter only replies from campaign recipients
  const uniqueRepliers = new Set();
  allIncoming.forEach(m => {
    const key = `${m.whatsapp_number_id}_${m.user_phone}`;
    if (campaignUsers.has(key)) {
      uniqueRepliers.add(key);
    }
  });

  return uniqueRepliers;
}

/**
 * Determine if status should be updated based on hierarchy
 * @param {string} currentStatus - Current status
 * @param {string} newStatus - New status to potentially apply
 * @returns {boolean}
 */
function shouldUpdateToStatus(currentStatus, newStatus) {
  // Special rule: If current status is "delivered" or "read",
  // ignore "failed" (multi-device: failed on one, delivered on another)
  if ((currentStatus === 'delivered' || currentStatus === 'read') && newStatus === 'failed') {
    return false;
  }

  // Always allow update to failed if no higher status exists
  if (newStatus === 'failed' && !currentStatus) {
    return true;
  }

  // Check hierarchy
  const currentLevel = STATUS_HIERARCHY[currentStatus] || 0;
  const newLevel = STATUS_HIERARCHY[newStatus] || 0;

  return newLevel > currentLevel;
}

/**
 * Get latest status for each unique message following best practices
 *
 * Handles:
 * - Duplicate webhooks (multi-device)
 * - Out-of-order delivery
 * - Contradictory statuses (delivered + failed)
 *
 * @param {Array} statusLogs - All status logs
 * @returns {Map<string, object>} Map of whatsapp_message_id to latest status object
 */
function getLatestStatusPerMessage(statusLogs) {
  const messageStatusMap = new Map();

  // Group all status logs by message ID
  statusLogs.forEach(log => {
    if (!log.whatsapp_message_id) return;

    if (!messageStatusMap.has(log.whatsapp_message_id)) {
      messageStatusMap.set(log.whatsapp_message_id, []);
    }
    messageStatusMap.get(log.whatsapp_message_id).push(log);
  });

  // For each message, determine the latest/highest status
  const messageLatestStatus = new Map();

  messageStatusMap.forEach((logs, messageId) => {
    // Sort by created_at (webhook arrival time)
    // Note: WhatsApp doesn't provide event timestamp in status webhooks,
    // so we use arrival time as best approximation
    const sortedLogs = logs.sort((a, b) => {
      return new Date(a.created_at) - new Date(b.created_at);
    });

    // Start with the first log
    let latestLog = sortedLogs[0];

    // Apply status hierarchy and special rules
    for (let i = 1; i < sortedLogs.length; i++) {
      const log = sortedLogs[i];

      if (shouldUpdateToStatus(latestLog.status, log.status)) {
        latestLog = log;
      }
    }

    messageLatestStatus.set(messageId, latestLog);
  });

  return messageLatestStatus;
}

/**
 * Calculate message statistics for given campaign IDs
 *
 * Returns standardized counts following WhatsApp Cloud API best practices
 *
 * @param {string[]} campaignIds - Array of campaign IDs to calculate stats for
 * @returns {Promise<object>} Statistics object
 */
async function calculateMessageStats(campaignIds) {
  if (!campaignIds || campaignIds.length === 0) {
    return {
      uniqueMessages: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
      // Derived metrics
      totalDelivered: 0, // delivered + read (at least delivered)
      totalRead: 0,      // same as read
      totalFailed: 0     // failed from status logs only
    };
  }

  // Fetch all data in parallel
  const [statusLogs, campaignMessages] = await Promise.all([
    fetchAllStatusLogs(campaignIds),
    fetchAllCampaignMessages(campaignIds)
  ]);

  // Get latest status for each unique message
  const messageLatestStatus = getLatestStatusPerMessage(statusLogs);

  // Count by latest status
  let statusCounts = {
    sent: 0,       // Still at "sent" status (not yet delivered)
    delivered: 0,  // Delivered but not read
    read: 0,       // Read (implies delivered)
    failed: 0      // Failed to deliver
  };

  messageLatestStatus.forEach(log => {
    const status = log.status;
    if (statusCounts.hasOwnProperty(status)) {
      statusCounts[status]++;
    }
  });

  // Get unique campaign users for reply counting
  const campaignUsers = new Set(
    campaignMessages.map(m => `${m.whatsapp_number_id}_${m.user_phone}`)
  );

  // Fetch replies
  const uniqueRepliers = await fetchAllReplies(campaignUsers);

  // Calculate derived metrics following best practices
  const totalDelivered = statusCounts.delivered + statusCounts.read; // At least delivered
  const totalRead = statusCounts.read;
  const totalFailed = statusCounts.failed;
  const replied = uniqueRepliers.size;

  return {
    // Raw counts by latest status
    uniqueMessages: messageLatestStatus.size,
    sent: statusCounts.sent,
    delivered: statusCounts.delivered,
    read: statusCounts.read,
    failed: statusCounts.failed,
    replied: replied,

    // Derived metrics (recommended for display)
    totalDelivered: totalDelivered,  // delivered + read
    totalRead: totalRead,
    totalFailed: totalFailed,

    // For debugging
    _meta: {
      totalStatusLogs: statusLogs.length,
      totalCampaignMessages: campaignMessages.length,
      campaignUsers: campaignUsers.size
    }
  };
}

/**
 * Calculate statistics with percentage breakdown
 * @param {string[]} campaignIds - Campaign IDs
 * @param {number} totalContacts - Total contacts in campaigns
 * @returns {Promise<object>} Stats with percentages
 */
async function calculateMessageStatsWithPercentages(campaignIds, totalContacts) {
  const stats = await calculateMessageStats(campaignIds);

  // Calculate percentages based on total contacts
  const calcPercentage = (count) => {
    return totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0;
  };

  // Total successfully sent (from campaign table, not status logs)
  // Note: This should be passed from campaign.total_sent, not calculated here

  return {
    // Message counts with percentages
    sent: {
      count: stats.sent,
      percentage: calcPercentage(stats.sent)
    },
    delivered: {
      count: stats.totalDelivered, // delivered + read
      percentage: calcPercentage(stats.totalDelivered)
    },
    read: {
      count: stats.totalRead,
      percentage: calcPercentage(stats.totalRead)
    },
    replied: {
      count: stats.replied,
      percentage: calcPercentage(stats.replied)
    },
    failed: {
      count: stats.totalFailed,
      percentage: calcPercentage(stats.totalFailed)
    },

    // Raw stats for reference
    _rawStats: stats
  };
}

/**
 * Calculate template-level statistics for a single campaign
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<object>} Template stats object
 */
async function calculateTemplateStats(campaignId) {
  // PERFORMANCE OPTIMIZATION: Try using fast RPC function first
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_template_stats_fast', { p_campaign_id: campaignId });

  if (!rpcError && rpcData && rpcData.length > 0) {
    // RPC succeeded - convert to expected format
    console.log(`[TemplateStats] Using optimized RPC for campaign ${campaignId}`);
    const templateStats = {};

    rpcData.forEach(row => {
      templateStats[row.template_name] = {
        total: parseInt(row.total),
        sent: parseInt(row.sent),
        delivered: parseInt(row.delivered),
        read: parseInt(row.read),
        replied: parseInt(row.replied),
        failed: parseInt(row.failed)
      };
    });

    return templateStats;
  }

  // Fallback to old method if RPC fails or returns no data
  console.warn(`[TemplateStats] RPC failed or no data, using fallback method for campaign ${campaignId}`);

  // Fetch send_queue data to get template mapping
  let queueData = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: batch, error } = await supabase
      .from('send_queue')
      .select('whatsapp_message_id, template_name, status, phone')
      .eq('campaign_id', campaignId)
      .order('id', { ascending: true }) // CRITICAL: Must order for consistent pagination
      .range(from, from + batchSize - 1);

    if (error) throw error;

    if (batch && batch.length > 0) {
      queueData = queueData.concat(batch);
      from += batchSize;
      hasMore = batch.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  // Get status logs for this campaign
  const statusLogs = await fetchAllStatusLogs([campaignId]);
  const messageLatestStatus = getLatestStatusPerMessage(statusLogs);

  // Map whatsapp_message_id to template (more reliable than phone mapping)
  const messageIdToTemplate = new Map();
  const phoneToTemplate = new Map(); // Fallback

  queueData.forEach(item => {
    if (!item.template_name) return;

    // Primary mapping: by whatsapp_message_id (most reliable)
    if (item.whatsapp_message_id) {
      messageIdToTemplate.set(item.whatsapp_message_id, item.template_name);
    }

    // Fallback mapping: by phone
    if (item.phone) {
      phoneToTemplate.set(item.phone, item.template_name);
    }
  });

  // Initialize template stats from send_queue
  const templateStats = {};

  queueData.forEach(item => {
    if (!item.template_name) return;

    if (!templateStats[item.template_name]) {
      templateStats[item.template_name] = {
        total: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0
      };
    }

    templateStats[item.template_name].total++;

    // Count sent from send_queue
    if (item.status === 'sent') {
      templateStats[item.template_name].sent++;
    }

    // Count failed from send_queue (sending failures)
    if (item.status === 'failed') {
      templateStats[item.template_name].failed++;
    }
  });

  // Get campaign messages
  const campaignMessages = await fetchAllCampaignMessages([campaignId]);

  // Build reverse lookup map for phone -> whatsapp_message_id (for fallback)
  const messageIdToPhone = new Map();
  campaignMessages.forEach(msg => {
    if (msg.whatsapp_message_id) {
      messageIdToPhone.set(msg.whatsapp_message_id, msg.user_phone);
    }
  });

  // Count delivery/read stats per template
  // FIXED: Iterate through status logs first instead of messages to ensure all statuses are counted
  messageLatestStatus.forEach((latestStatus, messageId) => {
    // Try primary mapping first (by message ID)
    let template = messageIdToTemplate.get(messageId);

    if (!template) {
      // Fallback to phone mapping
      const phone = messageIdToPhone.get(messageId);
      if (phone) {
        template = phoneToTemplate.get(phone);
      }
    }

    if (!template) {
      // No template mapping found - skip
      return;
    }

    // Ensure template stats exist
    if (!templateStats[template]) {
      templateStats[template] = {
        total: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0
      };
    }

    // Count delivered (delivered + read)
    if (latestStatus.status === 'delivered' || latestStatus.status === 'read') {
      templateStats[template].delivered++;
    }

    // Count read
    if (latestStatus.status === 'read') {
      templateStats[template].read++;
    }

    // Count WhatsApp-level failures
    if (latestStatus.status === 'failed') {
      templateStats[template].failed++;
    }
  });

  // Get replies per template
  const campaignUsers = new Set(
    campaignMessages.map(m => `${m.whatsapp_number_id}_${m.user_phone}`)
  );
  const uniqueRepliers = await fetchAllReplies(campaignUsers);

  // Map replies to phone numbers
  const replierPhones = new Set();
  uniqueRepliers.forEach(key => {
    const phone = key.split('_')[1]; // Extract phone from "numberid_phone"
    replierPhones.add(phone);
  });

  // Count replies per template
  campaignMessages.forEach(msg => {
    if (!replierPhones.has(msg.user_phone)) return;

    let template = messageIdToTemplate.get(msg.whatsapp_message_id);
    if (!template) {
      template = phoneToTemplate.get(msg.user_phone);
    }

    if (template && templateStats[template]) {
      templateStats[template].replied++;
    }
  });

  return templateStats;
}

module.exports = {
  calculateMessageStats,
  calculateMessageStatsWithPercentages,
  calculateTemplateStats,
  getLatestStatusPerMessage,
  fetchAllStatusLogs,
  STATUS_HIERARCHY
};
