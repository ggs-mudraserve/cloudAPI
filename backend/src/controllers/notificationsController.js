const {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification
} = require('../utils/notifications');

/**
 * List notifications with pagination
 */
exports.listNotifications = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const unread_only = req.query.unread_only === 'true';
    const read_only = req.query.read_only === 'true';

    const result = await listNotifications({ limit, offset, unread_only, read_only });

    res.json({
      success: true,
      data: result.notifications,
      total: result.total,
      limit,
      offset
    });

  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list notifications'
    });
  }
};

/**
 * Get unread notification count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await getUnreadCount();

    res.json({
      success: true,
      data: { count }
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count'
    });
  }
};

/**
 * Mark single notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await markAsRead(id);

    res.json({
      success: true,
      data: notification
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

/**
 * Mark all notifications as read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    await markAllAsRead();

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });

  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
    });
  }
};

/**
 * Delete a notification
 */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    await deleteNotification(id);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    });
  }
};
