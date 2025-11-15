const express = require('express');
const multer = require('multer');
const router = express.Router();
const campaignsController = require('../controllers/campaignsController');
const { validateJWT } = require('../middleware/auth');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size (for large campaigns)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// All routes require authentication
router.use(validateJWT);

// Campaign routes
router.get('/stats', campaignsController.getCampaignStats);
router.get('/', campaignsController.listCampaigns);
router.post('/', upload.single('csv'), campaignsController.createCampaign);
router.get('/:id', campaignsController.getCampaign);
router.delete('/:id', campaignsController.deleteCampaign);
router.patch('/:id/stop', campaignsController.stopCampaign);
router.patch('/:id/resume', campaignsController.resumeCampaign);
router.post('/:id/retry-failed', campaignsController.retryFailedMessages);

module.exports = router;
