const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { validateJWT } = require('../middleware/auth');

// All settings routes require authentication
router.use(validateJWT);

// Get global LLM settings
router.get('/llm', settingsController.getLLMSettings);

// Update global LLM settings
router.post('/llm', settingsController.updateLLMSettings);

// Test LLM connection
router.post('/llm/test', settingsController.testLLMConnection);

module.exports = router;
