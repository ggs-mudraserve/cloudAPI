const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');
const { validateJWT } = require('../middleware/auth');

// All routes require authentication
router.use(validateJWT);

/**
 * GET /api/messages/conversations
 * List all conversations with filters
 *
 * Query params:
 * - whatsapp_number_id: Filter by WhatsApp number (optional)
 * - search: Search in user_phone or message_body (optional)
 * - start_date: Filter from date (optional, ISO format)
 * - end_date: Filter to date (optional, ISO format)
 */
router.get('/conversations', messagesController.getConversations);

/**
 * GET /api/messages/conversations/:whatsapp_number_id/:user_phone
 * Get all messages for a specific conversation
 *
 * Query params:
 * - limit: Max messages to return (default: 100)
 * - offset: Pagination offset (default: 0)
 */
router.get('/conversations/:whatsapp_number_id/:user_phone', messagesController.getConversationMessages);

/**
 * GET /api/messages/search
 * Search messages across all conversations
 *
 * Query params:
 * - q: Search query (required)
 * - whatsapp_number_id: Filter by WhatsApp number (optional)
 * - limit: Max results (default: 50)
 */
router.get('/search', messagesController.searchMessages);

/**
 * GET /api/messages/stats
 * Get overall conversation statistics
 */
router.get('/stats', messagesController.getConversationStats);

module.exports = router;
