const { supabase } = require('../config/supabase');
const { fetchTemplates } = require('./whatsappService');

/**
 * Sync templates for a specific WhatsApp number
 * Fetches from WhatsApp Cloud API and upserts into database
 */
async function syncTemplatesForNumber(whatsappNumberId) {
  try {
    // Get WhatsApp number details
    const { data: whatsappNumber, error: fetchError } = await supabase
      .from('whatsapp_numbers')
      .select('id, number, phone_number_id, waba_id, access_token')
      .eq('id', whatsappNumberId)
      .single();

    if (fetchError || !whatsappNumber) {
      return {
        success: false,
        error: 'WhatsApp number not found'
      };
    }

    // Check if WABA ID exists
    if (!whatsappNumber.waba_id) {
      return {
        success: false,
        error: 'WABA ID not configured for this number. Please update the number with WABA ID.'
      };
    }

    // Fetch templates from WhatsApp API using WABA ID
    const result = await fetchTemplates(
      whatsappNumber.waba_id,
      whatsappNumber.access_token
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode
      };
    }

    const templates = result.templates || [];
    const existingTemplateNames = new Set();

    // Get existing templates for this number
    const { data: existingTemplates } = await supabase
      .from('templates')
      .select('name')
      .eq('whatsapp_number_id', whatsappNumberId);

    if (existingTemplates) {
      existingTemplates.forEach(t => existingTemplateNames.add(t.name));
    }

    // Track synced template names
    const syncedTemplateNames = new Set();
    let insertedCount = 0;
    let updatedCount = 0;
    let quarantinedCount = 0;

    // Upsert each template using the database function
    for (const template of templates) {
      syncedTemplateNames.add(template.name);

      // Prepare template data
      const templateData = {
        name: template.name,
        category: template.category,
        language: template.language,
        status: template.status,
        components: template.components
      };

      // Call the upsert_template function
      const { error: upsertError } = await supabase.rpc('upsert_template', {
        _number_id: whatsappNumberId,
        _data: templateData
      });

      if (upsertError) {
        console.error(`Failed to upsert template ${template.name}:`, upsertError);
        continue;
      }

      // Check if it was an insert or update
      if (existingTemplateNames.has(template.name)) {
        updatedCount++;
      } else {
        insertedCount++;
      }

      // Check if template was quarantined
      if (template.category === 'MARKETING' || template.category === 'AUTHENTICATION') {
        quarantinedCount++;
      }
    }

    // Mark deleted templates as inactive
    const deletedTemplates = [...existingTemplateNames].filter(
      name => !syncedTemplateNames.has(name)
    );

    if (deletedTemplates.length > 0) {
      await supabase
        .from('templates')
        .update({ is_active: false })
        .eq('whatsapp_number_id', whatsappNumberId)
        .in('name', deletedTemplates);
    }

    return {
      success: true,
      data: {
        total: templates.length,
        inserted: insertedCount,
        updated: updatedCount,
        deleted: deletedTemplates.length,
        quarantined: quarantinedCount
      }
    };

  } catch (error) {
    console.error('Template sync error:', error);
    return {
      success: false,
      error: 'Template sync failed'
    };
  }
}

/**
 * Sync templates for all active WhatsApp numbers
 */
async function syncAllTemplates() {
  try {
    // Get all active WhatsApp numbers
    const { data: whatsappNumbers, error } = await supabase
      .from('whatsapp_numbers')
      .select('id, display_name, number')
      .eq('is_active', true);

    if (error) {
      return {
        success: false,
        error: 'Failed to fetch WhatsApp numbers'
      };
    }

    if (!whatsappNumbers || whatsappNumbers.length === 0) {
      return {
        success: true,
        data: {
          message: 'No active WhatsApp numbers to sync',
          results: []
        }
      };
    }

    // Sync templates for each number
    const results = [];
    for (const number of whatsappNumbers) {
      const result = await syncTemplatesForNumber(number.id);
      results.push({
        whatsappNumberId: number.id,
        displayName: number.display_name || number.number,
        ...result
      });
    }

    // Calculate totals
    const totals = results.reduce((acc, r) => {
      if (r.success && r.data) {
        acc.total += r.data.total || 0;
        acc.inserted += r.data.inserted || 0;
        acc.updated += r.data.updated || 0;
        acc.deleted += r.data.deleted || 0;
        acc.quarantined += r.data.quarantined || 0;
      }
      return acc;
    }, { total: 0, inserted: 0, updated: 0, deleted: 0, quarantined: 0 });

    return {
      success: true,
      data: {
        numbersProcessed: whatsappNumbers.length,
        totals,
        results
      }
    };

  } catch (error) {
    console.error('Sync all templates error:', error);
    return {
      success: false,
      error: 'Failed to sync all templates'
    };
  }
}

/**
 * Create notification for quarantined templates
 */
async function createQuarantineNotification(whatsappNumberId, templateName, oldCategory, newCategory) {
  try {
    await supabase
      .from('notifications')
      .insert({
        type: 'warning',
        title: 'Template Quarantined',
        message: `Template "${templateName}" category changed from ${oldCategory} to ${newCategory} and has been quarantined.`,
        related_entity_type: 'template',
        related_entity_id: whatsappNumberId,
        action_url: '/templates'
      });
  } catch (error) {
    console.error('Failed to create quarantine notification:', error);
  }
}

module.exports = {
  syncTemplatesForNumber,
  syncAllTemplates,
  createQuarantineNotification
};
