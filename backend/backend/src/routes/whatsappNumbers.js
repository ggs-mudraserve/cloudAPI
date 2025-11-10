const express = require('express');
const router = express.Router();
const {
  testWhatsAppConnection,
  listWhatsAppNumbers,
  getWhatsAppNumber,
  addWhatsAppNumber,
  deleteWhatsAppNumber,
  updateWhatsAppNumber,
  syncProfile
} = require('../controllers/whatsappNumbersController');
const { validateJWT } = require('../middleware/auth');

// Apply JWT validation to all routes
router.use(validateJWT);

/**
 * @route   POST /api/whatsapp-numbers/test
 * @desc    Test WhatsApp Cloud API connection
 * @access  Private
 */
router.post('/test', testWhatsAppConnection);

/**
 * @route   GET /api/whatsapp-numbers
 * @desc    Get all WhatsApp numbers
 * @access  Private
 */
router.get('/', listWhatsAppNumbers);

/**
 * @route   GET /api/whatsapp-numbers/:id
 * @desc    Get single WhatsApp number by ID
 * @access  Private
 */
router.get('/:id', getWhatsAppNumber);

/**
 * @route   POST /api/whatsapp-numbers
 * @desc    Add new WhatsApp number
 * @access  Private
 */
router.post('/', addWhatsAppNumber);

/**
 * @route   PUT /api/whatsapp-numbers/:id
 * @desc    Update WhatsApp number (system prompt only)
 * @access  Private
 */
router.put('/:id', updateWhatsAppNumber);

/**
 * @route   POST /api/whatsapp-numbers/:id/sync-profile
 * @desc    Sync WhatsApp business profile (picture and verified name)
 * @access  Private
 */
router.post('/:id/sync-profile', syncProfile);

/**
 * @route   DELETE /api/whatsapp-numbers/:id
 * @desc    Delete WhatsApp number
 * @access  Private
 */
router.delete('/:id', deleteWhatsAppNumber);

module.exports = router;
