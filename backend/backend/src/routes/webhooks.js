const express = require('express');
const router = express.Router();
const webhooksController = require('../controllers/webhooksController');

// Webhook verification (GET) - Meta uses this to verify the endpoint
router.get('/', webhooksController.verifyWebhook);

// Webhook event handler (POST) - Receives messages and status updates
// Raw body is already captured by express.raw() middleware in server.js
router.post('/', webhooksController.handleWebhook);

module.exports = router;
