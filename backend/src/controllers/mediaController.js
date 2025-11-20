const { supabase } = require('../config/supabase');
const { uploadMedia } = require('../services/whatsappService');

/**
 * Upload media to WhatsApp and save to media library
 * POST /api/media/upload
 */
async function uploadMediaFile(req, res) {
  try {
    const { whatsapp_number_id, description } = req.body;

    if (!whatsapp_number_id) {
      return res.status(400).json({ error: 'whatsapp_number_id is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get WhatsApp number details
    const { data: whatsappNumber, error: numberError } = await supabase
      .from('whatsapp_numbers')
      .select('phone_number_id, access_token, display_name')
      .eq('id', whatsapp_number_id)
      .single();

    if (numberError || !whatsappNumber) {
      return res.status(404).json({ error: 'WhatsApp number not found' });
    }

    // Determine file type based on MIME type
    let fileType = 'document'; // default
    if (req.file.mimetype.startsWith('video/')) fileType = 'video';
    else if (req.file.mimetype.startsWith('image/')) fileType = 'image';
    else if (req.file.mimetype.startsWith('audio/')) fileType = 'audio';

    // Upload to WhatsApp Cloud API
    const uploadResult = await uploadMedia(
      whatsappNumber.phone_number_id,
      whatsappNumber.access_token,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        error: 'Failed to upload to WhatsApp',
        details: uploadResult.error
      });
    }

    // Save to media library
    const { data: mediaRecord, error: saveError } = await supabase
      .from('media_library')
      .insert({
        whatsapp_number_id,
        media_id: uploadResult.mediaId,
        file_name: req.file.originalname,
        file_type: fileType,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        description: description || null
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving to media library:', saveError);
      return res.status(500).json({ error: 'Failed to save media record' });
    }

    res.json({
      success: true,
      media: mediaRecord
    });
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get all media for a WhatsApp number
 * GET /api/media/:whatsappNumberId
 */
async function getMediaLibrary(req, res) {
  try {
    const { whatsappNumberId } = req.params;

    const { data, error } = await supabase
      .from('media_library')
      .select('*, whatsapp_numbers!inner(display_name)')
      .eq('whatsapp_number_id', whatsappNumberId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching media library:', error);
      return res.status(500).json({ error: 'Failed to fetch media library' });
    }

    res.json({ media: data });
  } catch (error) {
    console.error('Get media library error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get all media across all WhatsApp numbers (for admin view)
 * GET /api/media
 */
async function getAllMedia(req, res) {
  try {
    const { data, error } = await supabase
      .from('media_library')
      .select('*, whatsapp_numbers!inner(display_name, phone_number_id)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all media:', error);
      return res.status(500).json({ error: 'Failed to fetch media' });
    }

    res.json({ media: data });
  } catch (error) {
    console.error('Get all media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Delete media from library
 * DELETE /api/media/:id
 */
async function deleteMedia(req, res) {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('media_library')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting media:', error);
      return res.status(500).json({ error: 'Failed to delete media' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Update media description
 * PATCH /api/media/:id
 */
async function updateMedia(req, res) {
  try {
    const { id } = req.params;
    const { description } = req.body;

    const { data, error } = await supabase
      .from('media_library')
      .update({ description })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating media:', error);
      return res.status(500).json({ error: 'Failed to update media' });
    }

    res.json({ success: true, media: data });
  } catch (error) {
    console.error('Update media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  uploadMediaFile,
  getMediaLibrary,
  getAllMedia,
  deleteMedia,
  updateMedia
};
