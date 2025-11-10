const express = require('express');
const router = express.Router();
const {
  listTemplates,
  getTemplate,
  syncAll,
  syncByNumber,
  unquarantineTemplate,
  getTemplateHistory,
  getTemplateStats
} = require('../controllers/templatesController');
const { validateJWT } = require('../middleware/auth');

// Apply JWT validation to all routes
router.use(validateJWT);

/**
 * @route   GET /api/templates
 * @desc    List all templates with optional filters
 * @access  Private
 * @query   whatsapp_number_id, category, is_active, is_quarantined
 */
router.get('/', listTemplates);

/**
 * @route   GET /api/templates/stats
 * @desc    Get template statistics
 * @access  Private
 */
router.get('/stats', getTemplateStats);

/**
 * @route   POST /api/templates/sync-all
 * @desc    Sync templates for all WhatsApp numbers
 * @access  Private
 */
router.post('/sync-all', syncAll);

/**
 * @route   POST /api/templates/sync/:numberId
 * @desc    Sync templates for specific WhatsApp number
 * @access  Private
 */
router.post('/sync/:numberId', syncByNumber);

/**
 * @route   GET /api/templates/:id
 * @desc    Get single template by ID
 * @access  Private
 */
router.get('/:id', getTemplate);

/**
 * @route   GET /api/templates/:id/history
 * @desc    Get template category change history
 * @access  Private
 */
router.get('/:id/history', getTemplateHistory);

/**
 * @route   PATCH /api/templates/:id/unquarantine
 * @desc    Un-quarantine a template (only UTILITY category)
 * @access  Private
 */
router.patch('/:id/unquarantine', unquarantineTemplate);

module.exports = router;
