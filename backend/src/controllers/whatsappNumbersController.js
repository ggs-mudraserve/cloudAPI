const { supabase } = require('../config/supabase');
const { testConnection, getBusinessProfile } = require('../services/whatsappService');

/**
 * Test WhatsApp Cloud API connection
 * Validates token and returns number details
 */
async function testWhatsAppConnection(req, res) {
  try {
    const { phone_number_id, access_token } = req.body;

    if (!phone_number_id || !access_token) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'phone_number_id and access_token are required'
      });
    }

    // Test connection to WhatsApp API
    const result = await testConnection(phone_number_id, access_token);

    if (!result.success) {
      return res.status(400).json({
        error: 'Connection Failed',
        message: result.error,
        code: result.code
      });
    }

    res.json({
      success: true,
      message: 'Connection successful',
      data: result.data
    });

  } catch (error) {
    console.error('Test connection exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to test connection'
    });
  }
}

/**
 * List all WhatsApp numbers
 */
async function listWhatsAppNumbers(req, res) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .order('last_updated', { ascending: false });

    if (error) {
      console.error('List numbers error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to fetch WhatsApp numbers'
      });
    }

    // Don't return access tokens or app_secret to frontend
    const sanitizedData = data.map(num => ({
      id: num.id,
      number: num.number,
      display_name: num.display_name,
      phone_number_id: num.phone_number_id,
      waba_id: num.waba_id,
      system_prompt: num.system_prompt,
      max_send_rate_per_sec: num.max_send_rate_per_sec,
      last_stable_rate_per_sec: num.last_stable_rate_per_sec,
      last_updated: num.last_updated,
      quality_rating: num.quality_rating,
      tier: num.tier,
      is_active: num.is_active,
      profile_picture_url: num.profile_picture_url,
      verified_name: num.verified_name,
      app_id: num.app_id
    }));

    res.json({
      success: true,
      data: sanitizedData,
      count: sanitizedData.length
    });

  } catch (error) {
    console.error('List numbers exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list WhatsApp numbers'
    });
  }
}

/**
 * Get single WhatsApp number by ID
 */
async function getWhatsAppNumber(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'WhatsApp number not found'
        });
      }

      console.error('Get number error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to fetch WhatsApp number'
      });
    }

    // Don't return access token or app_secret
    const sanitizedData = {
      id: data.id,
      number: data.number,
      display_name: data.display_name,
      phone_number_id: data.phone_number_id,
      waba_id: data.waba_id,
      system_prompt: data.system_prompt,
      max_send_rate_per_sec: data.max_send_rate_per_sec,
      last_stable_rate_per_sec: data.last_stable_rate_per_sec,
      last_updated: data.last_updated,
      quality_rating: data.quality_rating,
      tier: data.tier,
      is_active: data.is_active,
      profile_picture_url: data.profile_picture_url,
      verified_name: data.verified_name,
      app_id: data.app_id
    };

    res.json({
      success: true,
      data: sanitizedData
    });

  } catch (error) {
    console.error('Get number exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get WhatsApp number'
    });
  }
}

/**
 * Add new WhatsApp number
 * Must pass test connection first
 */
async function addWhatsAppNumber(req, res) {
  try {
    const {
      number,
      display_name,
      phone_number_id,
      waba_id,
      access_token,
      system_prompt,
      app_id,
      app_secret
    } = req.body;

    // Validate required fields
    if (!number || !phone_number_id || !waba_id || !access_token) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'number, phone_number_id, waba_id, and access_token are required'
      });
    }

    // Validate app credentials if provided
    if (app_id && !app_secret) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'app_secret is required when app_id is provided'
      });
    }

    if (app_secret && !app_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'app_id is required when app_secret is provided'
      });
    }

    // Test connection before saving
    const testResult = await testConnection(phone_number_id, access_token);

    if (!testResult.success) {
      return res.status(400).json({
        error: 'Connection Failed',
        message: testResult.error,
        code: testResult.code
      });
    }

    // Insert into database
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .insert([{
        number,
        display_name: display_name || testResult.data.verified_name,
        phone_number_id,
        waba_id,
        access_token,
        system_prompt: system_prompt || 'You are a helpful assistant.',
        quality_rating: testResult.data.quality_rating,
        tier: testResult.data.tier,
        is_active: true,
        app_id: app_id || null,
        app_secret: app_secret || null
      }])
      .select()
      .single();

    if (error) {
      // Check for duplicate number
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Conflict',
          message: 'This WhatsApp number is already registered'
        });
      }

      console.error('Add number error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to add WhatsApp number'
      });
    }

    // Don't return access token or app_secret
    const sanitizedData = {
      id: data.id,
      number: data.number,
      display_name: data.display_name,
      phone_number_id: data.phone_number_id,
      waba_id: data.waba_id,
      system_prompt: data.system_prompt,
      max_send_rate_per_sec: data.max_send_rate_per_sec,
      last_stable_rate_per_sec: data.last_stable_rate_per_sec,
      quality_rating: data.quality_rating,
      tier: data.tier,
      is_active: data.is_active,
      profile_picture_url: data.profile_picture_url,
      verified_name: data.verified_name,
      app_id: data.app_id
    };

    res.status(201).json({
      success: true,
      message: 'WhatsApp number added successfully',
      data: sanitizedData
    });

  } catch (error) {
    console.error('Add number exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add WhatsApp number'
    });
  }
}

/**
 * Delete WhatsApp number
 */
async function deleteWhatsAppNumber(req, res) {
  try {
    const { id } = req.params;

    // Check if number exists
    const { data: existing, error: fetchError } = await supabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'WhatsApp number not found'
      });
    }

    // Delete the number (CASCADE will handle related records)
    const { error } = await supabase
      .from('whatsapp_numbers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete number error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to delete WhatsApp number'
      });
    }

    res.json({
      success: true,
      message: 'WhatsApp number deleted successfully'
    });

  } catch (error) {
    console.error('Delete number exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete WhatsApp number'
    });
  }
}

/**
 * Update WhatsApp number (system prompt only)
 */
async function updateWhatsAppNumber(req, res) {
  try {
    const { id } = req.params;
    const { system_prompt } = req.body;

    if (!system_prompt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'system_prompt is required'
      });
    }

    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .update({ system_prompt })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'WhatsApp number not found'
        });
      }

      console.error('Update number error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to update WhatsApp number'
      });
    }

    res.json({
      success: true,
      message: 'System prompt updated successfully',
      data: {
        id: data.id,
        system_prompt: data.system_prompt
      }
    });

  } catch (error) {
    console.error('Update number exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update WhatsApp number'
    });
  }
}

/**
 * Sync WhatsApp business profile
 * Fetches profile picture and verified name from WhatsApp Cloud API
 */
async function syncProfile(req, res) {
  try {
    const { id } = req.params;

    // Get WhatsApp number details including access token
    const { data: whatsappNumber, error: fetchError } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !whatsappNumber) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'WhatsApp number not found'
      });
    }

    // Fetch business profile from WhatsApp API
    const profileResult = await getBusinessProfile(
      whatsappNumber.phone_number_id,
      whatsappNumber.access_token,
      whatsappNumber.waba_id
    );

    if (!profileResult.success) {
      return res.status(400).json({
        error: 'Sync Failed',
        message: profileResult.error,
        code: profileResult.errorCode
      });
    }

    // Update database with profile info
    const { data: updatedNumber, error: updateError } = await supabase
      .from('whatsapp_numbers')
      .update({
        profile_picture_url: profileResult.data.profile_picture_url,
        verified_name: profileResult.data.verified_name,
        display_name: profileResult.data.verified_name || whatsappNumber.display_name
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Update profile error:', updateError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to update profile information'
      });
    }

    // Create a helpful message based on name_status
    let message = 'Profile synced successfully';
    const nameStatus = profileResult.data.name_status;

    if (nameStatus === 'PENDING_REVIEW') {
      message = 'Profile synced. Note: Display name change is pending Meta approval.';
    } else if (nameStatus === 'DECLINED') {
      message = 'Profile synced. Warning: Display name change was declined by Meta.';
    }

    res.json({
      success: true,
      message,
      data: {
        id: updatedNumber.id,
        verified_name: updatedNumber.verified_name,
        profile_picture_url: updatedNumber.profile_picture_url,
        display_name: updatedNumber.display_name,
        name_status: nameStatus
      }
    });

  } catch (error) {
    console.error('Sync profile exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to sync profile'
    });
  }
}

module.exports = {
  testWhatsAppConnection,
  listWhatsAppNumbers,
  getWhatsAppNumber,
  addWhatsAppNumber,
  deleteWhatsAppNumber,
  updateWhatsAppNumber,
  syncProfile
};
