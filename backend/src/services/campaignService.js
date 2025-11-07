const csv = require('csv-parser');
const { Readable } = require('stream');
const { supabase } = require('../config/supabase');

/**
 * Validate Indian phone number
 * Must be exactly 12 digits starting with 91
 */
function validatePhone(phone) {
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  if (cleanPhone.length !== 12) {
    return { valid: false, reason: 'Phone must be exactly 12 digits' };
  }

  if (!cleanPhone.startsWith('91')) {
    return { valid: false, reason: 'Phone must start with 91 (India)' };
  }

  return { valid: true, phone: cleanPhone };
}

/**
 * Parse CSV buffer and extract contacts with variables
 * CSV Format: Phone,Variable1,Variable2,...
 */
async function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const contacts = [];
    const stream = Readable.from(buffer.toString());

    stream
      .pipe(csv())
      .on('data', (row) => {
        const keys = Object.keys(row);
        if (keys.length === 0) return;

        // First column is phone number
        const phoneCol = keys[0];
        const phone = row[phoneCol];

        // Remaining columns are template variables
        const variables = {};
        for (let i = 1; i < keys.length; i++) {
          variables[`var${i}`] = row[keys[i]];
        }

        contacts.push({
          phone,
          variables
        });
      })
      .on('end', () => resolve(contacts))
      .on('error', (err) => reject(err));
  });
}

/**
 * Validate contacts and split into valid/invalid
 */
function validateContacts(contacts) {
  const validContacts = [];
  const invalidContacts = [];

  for (const contact of contacts) {
    const validation = validatePhone(contact.phone);

    if (validation.valid) {
      validContacts.push({
        phone: validation.phone,
        variables: contact.variables,
        is_valid: true
      });
    } else {
      invalidContacts.push({
        phone: contact.phone,
        variables: contact.variables,
        is_valid: false,
        invalid_reason: validation.reason
      });
    }
  }

  return { validContacts, invalidContacts };
}

/**
 * Distribute contacts evenly among selected templates
 */
function distributeContacts(validContacts, templateNames) {
  const distribution = {};
  templateNames.forEach(name => {
    distribution[name] = [];
  });

  // Round-robin distribution
  validContacts.forEach((contact, index) => {
    const templateIndex = index % templateNames.length;
    const templateName = templateNames[templateIndex];
    distribution[templateName].push(contact);
  });

  return distribution;
}

/**
 * Create campaign with CSV processing
 */
async function createCampaign(campaignData, csvBuffer) {
  try {
    // Parse CSV
    const rawContacts = await parseCSV(csvBuffer);

    if (rawContacts.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Validate contacts
    const { validContacts, invalidContacts } = validateContacts(rawContacts);

    // Distribute valid contacts among templates
    const distribution = distributeContacts(validContacts, campaignData.template_names);

    // Calculate totals
    const totalContacts = validContacts.length;
    const invalidContactsCount = invalidContacts.length;

    // Start transaction
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: campaignData.name,
        whatsapp_number_id: campaignData.whatsapp_number_id,
        template_names: campaignData.template_names,
        total_contacts: totalContacts,
        invalid_contacts_count: invalidContactsCount,
        scheduled_start_time: campaignData.scheduled_start_time,
        is_scheduled: campaignData.is_scheduled || false,
        status: campaignData.is_scheduled ? 'scheduled' : 'running'
      })
      .select()
      .single();

    if (campaignError) throw campaignError;

    // Store ALL contacts (valid and invalid) in campaign_contacts
    const allContactsWithCampaignId = [
      ...validContacts.map(contact => ({
        campaign_id: campaign.id,
        phone: contact.phone,
        template_name: null, // Will be set below for valid contacts
        variables: contact.variables,
        is_valid: true
      })),
      ...invalidContacts.map(contact => ({
        campaign_id: campaign.id,
        phone: contact.phone,
        template_name: null,
        variables: contact.variables,
        is_valid: false,
        invalid_reason: contact.invalid_reason
      }))
    ];

    // Update valid contacts with template names from distribution
    let contactIndex = 0;
    for (const templateName of campaignData.template_names) {
      const contactsForTemplate = distribution[templateName];
      contactsForTemplate.forEach(contact => {
        const matchingContact = allContactsWithCampaignId.find(
          c => c.phone === contact.phone && c.is_valid === true && !c.template_name
        );
        if (matchingContact) {
          matchingContact.template_name = templateName;
        }
      });
    }

    // Insert all contacts
    const { error: contactsError } = await supabase
      .from('campaign_contacts')
      .insert(allContactsWithCampaignId);

    if (contactsError) {
      // Rollback: delete campaign
      await supabase.from('campaigns').delete().eq('id', campaign.id);
      throw contactsError;
    }

    // If not scheduled, enqueue valid messages immediately
    if (!campaignData.is_scheduled) {
      await enqueueMessages(campaign.id, campaign.whatsapp_number_id, distribution);
    }

    return {
      campaign,
      totalContacts,
      invalidContactsCount,
      distribution: Object.keys(distribution).map(template => ({
        template,
        count: distribution[template].length
      }))
    };

  } catch (error) {
    console.error('Error creating campaign:', error);
    throw error;
  }
}

/**
 * Enqueue messages for a campaign
 */
async function enqueueMessages(campaignId, whatsappNumberId, distribution) {
  const queueEntries = [];

  for (const [templateName, contacts] of Object.entries(distribution)) {
    for (const contact of contacts) {
      queueEntries.push({
        campaign_id: campaignId,
        whatsapp_number_id: whatsappNumberId,
        template_name: templateName,
        phone: contact.phone,
        payload: contact.variables,
        status: 'ready' // Ready to be processed
      });
    }
  }

  const { error } = await supabase
    .from('send_queue')
    .insert(queueEntries);

  if (error) throw error;
}

/**
 * List campaigns with optional filters
 */
async function listCampaigns(filters = {}) {
  let query = supabase
    .from('campaigns')
    .select(`
      *,
      whatsapp_numbers (
        id,
        number,
        display_name
      )
    `)
    .order('created_at', { ascending: false });

  if (filters.whatsapp_number_id) {
    query = query.eq('whatsapp_number_id', filters.whatsapp_number_id);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data;
}

/**
 * Get single campaign with details
 */
async function getCampaign(campaignId) {
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select(`
      *,
      whatsapp_numbers (
        id,
        number,
        display_name
      )
    `)
    .eq('id', campaignId)
    .single();

  if (campaignError) throw campaignError;

  // Get contact statistics
  const { data: contactStats, error: statsError } = await supabase
    .from('campaign_contacts')
    .select('template_name, is_valid')
    .eq('campaign_id', campaignId);

  if (statsError) throw statsError;

  // Calculate distribution
  const distribution = {};
  contactStats.forEach(contact => {
    if (!contact.template_name) return;

    if (!distribution[contact.template_name]) {
      distribution[contact.template_name] = { valid: 0, invalid: 0 };
    }

    if (contact.is_valid) {
      distribution[contact.template_name].valid++;
    } else {
      distribution[contact.template_name].invalid++;
    }
  });

  // Get send statistics per template from send_queue
  const { data: queueStats, error: queueError } = await supabase
    .from('send_queue')
    .select('template_name, status')
    .eq('campaign_id', campaignId);

  if (queueError) throw queueError;

  // Calculate send stats per template
  const templateStats = {};
  (queueStats || []).forEach(item => {
    if (!item.template_name) return;

    if (!templateStats[item.template_name]) {
      templateStats[item.template_name] = {
        sent: 0,
        failed: 0,
        ready: 0,
        processing: 0,
        total: 0
      };
    }

    templateStats[item.template_name].total++;

    if (item.status === 'sent') {
      templateStats[item.template_name].sent++;
    } else if (item.status === 'failed') {
      templateStats[item.template_name].failed++;
    } else if (item.status === 'ready') {
      templateStats[item.template_name].ready++;
    } else if (item.status === 'processing') {
      templateStats[item.template_name].processing++;
    }
  });

  return {
    ...campaign,
    distribution,
    templateStats
  };
}

/**
 * Delete scheduled campaign
 */
async function deleteCampaign(campaignId) {
  // Check if campaign can be deleted
  const { data: campaign, error: fetchError } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (fetchError) throw fetchError;

  if (campaign.status === 'running') {
    throw new Error('Cannot delete a running campaign. Stop it first.');
  }

  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) throw error;

  return { success: true };
}

/**
 * Stop/pause a running campaign
 */
async function stopCampaign(campaignId) {
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'paused', end_time: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('status', 'running')
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('Campaign not found or not running');

  return data;
}

/**
 * Resume a paused campaign
 */
async function resumeCampaign(campaignId) {
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status: 'running', end_time: null })
    .eq('id', campaignId)
    .eq('status', 'paused')
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('Campaign not found or not paused');

  return data;
}

module.exports = {
  createCampaign,
  listCampaigns,
  getCampaign,
  deleteCampaign,
  stopCampaign,
  resumeCampaign,
  validatePhone,
  enqueueMessages
};
