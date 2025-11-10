const { supabase } = require('../config/supabase');

/**
 * Notification types
 */
const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * Related entity types
 */
const ENTITY_TYPES = {
  CAMPAIGN: 'campaign',
  TEMPLATE: 'template',
  WHATSAPP_NUMBER: 'whatsapp_number'
};

/**
 * Create a notification
 * @param {Object} notificationData
 * @param {string} notificationData.type - info, success, warning, error
 * @param {string} notificationData.title - Short title
 * @param {string} notificationData.message - Detailed message
 * @param {string} [notificationData.action_url] - Optional URL to navigate to
 * @param {string} [notificationData.related_entity_type] - campaign, template, whatsapp_number
 * @param {string} [notificationData.related_entity_id] - UUID of related entity
 * @returns {Promise<Object>} Created notification
 */
async function createNotification({
  type,
  title,
  message,
  action_url = null,
  related_entity_type = null,
  related_entity_id = null
}) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        type,
        title,
        message,
        action_url,
        related_entity_type,
        related_entity_id,
        is_read: false
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Notification] Created: ${type} - ${title}`);
    return data;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Create campaign completed notification
 */
async function notifyCampaignCompleted(campaignId, campaignName, totalSent, totalFailed) {
  return createNotification({
    type: NOTIFICATION_TYPES.SUCCESS,
    title: 'Campaign Completed',
    message: `Campaign "${campaignName}" has completed. Sent: ${totalSent}, Failed: ${totalFailed}`,
    action_url: `/campaigns/${campaignId}`,
    related_entity_type: ENTITY_TYPES.CAMPAIGN,
    related_entity_id: campaignId
  });
}

/**
 * Create campaign failed notification
 */
async function notifyCampaignFailed(campaignId, campaignName, reason) {
  return createNotification({
    type: NOTIFICATION_TYPES.ERROR,
    title: 'Campaign Failed',
    message: `Campaign "${campaignName}" failed to start. Reason: ${reason}`,
    action_url: `/campaigns/${campaignId}`,
    related_entity_type: ENTITY_TYPES.CAMPAIGN,
    related_entity_id: campaignId
  });
}

/**
 * Create campaign stopped notification
 */
async function notifyCampaignStopped(campaignId, campaignName) {
  return createNotification({
    type: NOTIFICATION_TYPES.WARNING,
    title: 'Campaign Stopped',
    message: `Campaign "${campaignName}" has been stopped`,
    action_url: `/campaigns/${campaignId}`,
    related_entity_type: ENTITY_TYPES.CAMPAIGN,
    related_entity_id: campaignId
  });
}

/**
 * Create template quarantined notification
 */
async function notifyTemplateQuarantined(templateName, whatsappNumberId, oldCategory, newCategory) {
  return createNotification({
    type: NOTIFICATION_TYPES.WARNING,
    title: 'Template Quarantined',
    message: `Template "${templateName}" category changed from ${oldCategory} to ${newCategory} and has been quarantined`,
    action_url: '/templates',
    related_entity_type: ENTITY_TYPES.TEMPLATE,
    related_entity_id: whatsappNumberId
  });
}

/**
 * Create WhatsApp number token expired notification
 */
async function notifyTokenExpired(whatsappNumberId, displayName) {
  return createNotification({
    type: NOTIFICATION_TYPES.ERROR,
    title: 'Access Token Expired',
    message: `WhatsApp number "${displayName}" access token has expired. Please update the token.`,
    action_url: '/whatsapp-numbers',
    related_entity_type: ENTITY_TYPES.WHATSAPP_NUMBER,
    related_entity_id: whatsappNumberId
  });
}

/**
 * List notifications with pagination
 * @param {Object} options
 * @param {number} [options.limit=50] - Max notifications to return
 * @param {number} [options.offset=0] - Offset for pagination
 * @param {boolean} [options.unread_only=false] - Only return unread notifications
 * @param {boolean} [options.read_only=false] - Only return read notifications
 * @returns {Promise<Array>} Array of notifications
 */
async function listNotifications({ limit = 50, offset = 0, unread_only = false, read_only = false } = {}) {
  try {
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unread_only) {
      query = query.eq('is_read', false);
    } else if (read_only) {
      query = query.eq('is_read', true);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return { notifications: data, total: count };
  } catch (error) {
    console.error('Error listing notifications:', error);
    throw error;
  }
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead() {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

/**
 * Get unread notification count
 */
async function getUnreadCount() {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    if (error) throw error;

    return count;
  } catch (error) {
    console.error('Error getting unread count:', error);
    throw error;
  }
}

/**
 * Delete a notification
 */
async function deleteNotification(notificationId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;

    console.log(`[Notification] Deleted: ${notificationId}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  ENTITY_TYPES,
  createNotification,
  notifyCampaignCompleted,
  notifyCampaignFailed,
  notifyCampaignStopped,
  notifyTemplateQuarantined,
  notifyTokenExpired,
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification
};
