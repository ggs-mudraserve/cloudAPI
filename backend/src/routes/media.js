const express = require('express');
const router = express.Router();
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { validateJWT } = require('../middleware/auth');

// All routes require authentication
router.use(validateJWT);

/**
 * GET /api/media/:messageId
 * Proxy endpoint to fetch WhatsApp media with authentication
 */
router.get('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Get message and media_url from database
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('media_url, whatsapp_number_id')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!message.media_url) {
      return res.status(404).json({ error: 'No media URL for this message' });
    }

    // Get access token for this WhatsApp number
    const { data: whatsappNumber, error: numberError } = await supabase
      .from('whatsapp_numbers')
      .select('access_token')
      .eq('id', message.whatsapp_number_id)
      .single();

    if (numberError || !whatsappNumber) {
      return res.status(404).json({ error: 'WhatsApp number not found' });
    }

    // Fetch media from WhatsApp with access token
    const response = await axios.get(message.media_url, {
      headers: {
        'Authorization': `Bearer ${whatsappNumber.access_token}`
      },
      responseType: 'arraybuffer'
    });

    // Get content type from response
    const contentType = response.headers['content-type'] || 'image/jpeg';

    // Send media to frontend
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(response.data);

  } catch (error) {
    console.error('[Media Proxy] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

module.exports = router;
