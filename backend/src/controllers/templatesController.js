const { supabase } = require('../config/supabase');
const { syncTemplatesForNumber, syncAllTemplates } = require('../services/templateSyncService');

/**
 * List all templates with optional filters
 */
async function listTemplates(req, res) {
  try {
    const { whatsapp_number_id, category, is_active, is_quarantined } = req.query;

    let query = supabase
      .from('templates')
      .select(`
        id,
        name,
        category,
        language,
        status,
        components,
        last_synced,
        is_active,
        is_quarantined,
        whatsapp_number_id,
        whatsapp_numbers (
          display_name,
          number
        )
      `)
      .order('last_synced', { ascending: false });

    // Apply filters
    if (whatsapp_number_id) {
      query = query.eq('whatsapp_number_id', whatsapp_number_id);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }
    if (is_quarantined !== undefined) {
      query = query.eq('is_quarantined', is_quarantined === 'true');
    }

    const { data, error } = await query;

    if (error) {
      console.error('List templates error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to fetch templates'
      });
    }

    res.json({
      success: true,
      data: data || [],
      count: data ? data.length : 0
    });

  } catch (error) {
    console.error('List templates exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list templates'
    });
  }
}

/**
 * Get single template by ID
 */
async function getTemplate(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('templates')
      .select(`
        *,
        whatsapp_numbers (
          display_name,
          number
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Template not found'
        });
      }

      console.error('Get template error:', error);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to fetch template'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Get template exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get template'
    });
  }
}

/**
 * Sync templates for all WhatsApp numbers
 */
async function syncAll(req, res) {
  try {
    const result = await syncAllTemplates();

    if (!result.success) {
      return res.status(500).json({
        error: 'Sync Failed',
        message: result.error
      });
    }

    res.json({
      success: true,
      message: 'Templates synced successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Sync all exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to sync templates'
    });
  }
}

/**
 * Sync templates for a specific WhatsApp number
 */
async function syncByNumber(req, res) {
  try {
    const { numberId } = req.params;

    const result = await syncTemplatesForNumber(numberId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Sync Failed',
        message: result.error,
        code: result.errorCode
      });
    }

    res.json({
      success: true,
      message: 'Templates synced successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Sync by number exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to sync templates'
    });
  }
}

/**
 * Un-quarantine a template (manual action by admin)
 * Only allowed if current category is UTILITY
 */
async function unquarantineTemplate(req, res) {
  try {
    const { id } = req.params;

    // Get template details
    const { data: template, error: fetchError } = await supabase
      .from('templates')
      .select('id, name, category, is_quarantined')
      .eq('id', id)
      .single();

    if (fetchError || !template) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Template not found'
      });
    }

    // Only allow un-quarantine if category is UTILITY
    if (template.category !== 'UTILITY') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Can only un-quarantine UTILITY templates. Current category: ' + template.category
      });
    }

    // Already not quarantined
    if (!template.is_quarantined) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Template is not quarantined'
      });
    }

    // Un-quarantine
    const { error: updateError } = await supabase
      .from('templates')
      .update({
        is_quarantined: false,
        is_active: true
      })
      .eq('id', id);

    if (updateError) {
      console.error('Un-quarantine error:', updateError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to un-quarantine template'
      });
    }

    res.json({
      success: true,
      message: 'Template un-quarantined successfully'
    });

  } catch (error) {
    console.error('Un-quarantine exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to un-quarantine template'
    });
  }
}

/**
 * Get template history (category changes)
 */
async function getTemplateHistory(req, res) {
  try {
    const { id } = req.params;

    // Get template details
    const { data: template, error: fetchError } = await supabase
      .from('templates')
      .select('name, whatsapp_number_id')
      .eq('id', id)
      .single();

    if (fetchError || !template) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Template not found'
      });
    }

    // Get audit trail
    const { data: history, error: historyError } = await supabase
      .from('audit_template_changes')
      .select('*')
      .eq('whatsapp_number_id', template.whatsapp_number_id)
      .eq('template_name', template.name)
      .order('detected_at', { ascending: false });

    if (historyError) {
      console.error('Get history error:', historyError);
      return res.status(500).json({
        error: 'Database Error',
        message: 'Failed to fetch template history'
      });
    }

    res.json({
      success: true,
      data: history || []
    });

  } catch (error) {
    console.error('Get history exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get template history'
    });
  }
}

/**
 * Get template statistics
 */
async function getTemplateStats(req, res) {
  try {
    const { data: stats, error } = await supabase.rpc('get_template_stats');

    if (error) {
      // If function doesn't exist, calculate manually
      const { data: templates } = await supabase.from('templates').select('category, is_active, is_quarantined');

      const statsData = {
        total: templates?.length || 0,
        active: templates?.filter(t => t.is_active).length || 0,
        quarantined: templates?.filter(t => t.is_quarantined).length || 0,
        by_category: {
          UTILITY: templates?.filter(t => t.category === 'UTILITY').length || 0,
          MARKETING: templates?.filter(t => t.category === 'MARKETING').length || 0,
          AUTHENTICATION: templates?.filter(t => t.category === 'AUTHENTICATION').length || 0
        }
      };

      return res.json({
        success: true,
        data: statsData
      });
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get stats exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get template statistics'
    });
  }
}

module.exports = {
  listTemplates,
  getTemplate,
  syncAll,
  syncByNumber,
  unquarantineTemplate,
  getTemplateHistory,
  getTemplateStats
};
