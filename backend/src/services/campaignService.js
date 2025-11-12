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
    // CRITICAL FIX: Create campaign with 'paused' status first to avoid race condition
    // Only set to 'running' AFTER queue is populated
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
        status: campaignData.is_scheduled ? 'scheduled' : 'paused' // Use 'paused' temporarily
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
      await enqueueMessages(campaign.id, campaign.whatsapp_number_id, distribution, {});

      // CRITICAL FIX: Only mark campaign as 'running' AFTER queue is fully populated
      // This prevents race condition where queue processor sees running campaign with 0 messages
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({
          status: 'running',
          start_time: new Date().toISOString()
        })
        .eq('id', campaign.id);

      if (updateError) {
        console.error('Error updating campaign status to running:', updateError);
        throw updateError;
      }

      console.log(`[Campaign] Campaign ${campaign.id} marked as running after queue populated`);

      // Update campaign object to reflect new status
      campaign.status = 'running';
      campaign.start_time = new Date().toISOString();
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
async function enqueueMessages(campaignId, whatsappNumberId, distribution, templateMediaUrls = {}) {
  const queueEntries = [];

  // Fetch template components for all templates in this campaign
  const templateNames = Object.keys(distribution);
  const { data: templates, error: templateError } = await supabase
    .from('templates')
    .select('name, components')
    .eq('whatsapp_number_id', whatsappNumberId)
    .in('name', templateNames);

  if (templateError) {
    console.error('Error fetching templates for enqueueing:', templateError);
    throw templateError;
  }

  // Create a map of template name -> template data
  const templateMap = {};
  templates.forEach(template => {
    templateMap[template.name] = template;
  });

  for (const [templateName, contacts] of Object.entries(distribution)) {
    const template = templateMap[templateName];

    // Check if template has a media header (VIDEO, IMAGE, or DOCUMENT)
    const headerComponent = template?.components?.find(c => c.type === 'HEADER');
    const hasMediaHeader = headerComponent &&
      (headerComponent.format === 'VIDEO' || headerComponent.format === 'IMAGE' || headerComponent.format === 'DOCUMENT');

    for (const contact of contacts) {
      let payload = contact.variables;

      // If template has media header, check if CSV already provides media URL
      if (hasMediaHeader) {
        // Check if var1 from CSV is already a media URL
        const csvHasMediaUrl = contact.variables.var1 &&
          (String(contact.variables.var1).startsWith('http://') ||
           String(contact.variables.var1).startsWith('https://'));

        if (csvHasMediaUrl) {
          // CSV already has media URL in var1, use it as-is (no shifting needed)
          console.log(`[Campaign] Using media URL from CSV for template ${templateName}`);
          payload = contact.variables;
        } else {
          // CSV doesn't have media URL, try to inject from templateMediaUrls or template example
          let mediaUrl = templateMediaUrls[templateName];

          // If no custom media URL provided, try to use template's example media URL
          if (!mediaUrl && headerComponent.example?.header_handle?.[0]) {
            mediaUrl = headerComponent.example.header_handle[0];
          }

          if (mediaUrl) {
            // Prepend media URL as var1, shift other variables
            payload = {
              var1: mediaUrl,
              ...Object.fromEntries(
                Object.entries(contact.variables).map(([key, value]) => {
                  const varNum = parseInt(key.replace('var', ''));
                  return [`var${varNum + 1}`, value];
                })
              )
            };
            console.log(`[Campaign] Injected media URL from template example for ${templateName}`);
          } else {
            console.warn(`[Campaign] Template ${templateName} has media header but no media URL available (CSV, custom, or example)`);
          }
        }
      }

      queueEntries.push({
        campaign_id: campaignId,
        whatsapp_number_id: whatsappNumberId,
        template_name: templateName,
        phone: contact.phone,
        payload: payload,
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

  // Get send statistics per template from send_queue with pagination
  let queueStats = [];
  let fromQueue = 0;
  const batchSize = 1000;
  let hasMoreQueue = true;

  while (hasMoreQueue) {
    const { data: batch, error: queueError } = await supabase
      .from('send_queue')
      .select('template_name, status, phone')
      .eq('campaign_id', campaignId)
      .range(fromQueue, fromQueue + batchSize - 1);

    if (queueError) throw queueError;

    if (batch && batch.length > 0) {
      queueStats = queueStats.concat(batch);
      fromQueue += batchSize;
      hasMoreQueue = batch.length === batchSize;
    } else {
      hasMoreQueue = false;
    }
  }

  // Get message status logs for this campaign with pagination
  let statusLogs = [];
  let fromStatus = 0;
  let hasMoreStatus = true;

  while (hasMoreStatus) {
    const { data: batch, error: statusError } = await supabase
      .from('message_status_logs')
      .select('whatsapp_message_id, status, created_at')
      .eq('campaign_id', campaignId)
      .range(fromStatus, fromStatus + batchSize - 1);

    if (statusError) throw statusError;

    if (batch && batch.length > 0) {
      statusLogs = statusLogs.concat(batch);
      fromStatus += batchSize;
      hasMoreStatus = batch.length === batchSize;
    } else {
      hasMoreStatus = false;
    }
  }

  // Get latest status for each message
  const messageLatestStatus = new Map();
  statusLogs.forEach(log => {
    const existing = messageLatestStatus.get(log.whatsapp_message_id);
    if (!existing || new Date(log.created_at) > new Date(existing.created_at)) {
      messageLatestStatus.set(log.whatsapp_message_id, log);
    }
  });

  // Get campaign messages with template info
  let campaignMessages = [];
  let fromMessages = 0;
  let hasMoreMessages = true;

  while (hasMoreMessages) {
    const { data: batch, error: messagesError } = await supabase
      .from('messages')
      .select('whatsapp_message_id, user_phone, whatsapp_number_id')
      .eq('campaign_id', campaignId)
      .eq('direction', 'outgoing')
      .range(fromMessages, fromMessages + batchSize - 1);

    if (messagesError) throw messagesError;

    if (batch && batch.length > 0) {
      campaignMessages = campaignMessages.concat(batch);
      fromMessages += batchSize;
      hasMoreMessages = batch.length === batchSize;
    } else {
      hasMoreMessages = false;
    }
  }

  // Create map of phone -> template from send_queue
  const phoneToTemplate = new Map();
  queueStats.forEach(item => {
    if (item.template_name && item.phone) {
      phoneToTemplate.set(item.phone, item.template_name);
    }
  });

  // Get incoming messages (replies) with pagination
  const campaignUsers = new Set(campaignMessages.map(m => `${m.whatsapp_number_id}_${m.user_phone}`));

  let incomingMessages = [];
  let fromIncoming = 0;
  let hasMoreIncoming = true;

  while (hasMoreIncoming) {
    const { data: batch, error: incomingError } = await supabase
      .from('messages')
      .select('user_phone, whatsapp_number_id')
      .eq('direction', 'incoming')
      .range(fromIncoming, fromIncoming + batchSize - 1);

    if (incomingError) throw incomingError;

    if (batch && batch.length > 0) {
      incomingMessages = incomingMessages.concat(batch);
      fromIncoming += batchSize;
      hasMoreIncoming = batch.length === batchSize;
    } else {
      hasMoreIncoming = false;
    }
  }

  // Map replies to templates
  const repliesByPhone = new Map();
  incomingMessages.forEach(m => {
    const key = `${m.whatsapp_number_id}_${m.user_phone}`;
    if (campaignUsers.has(key)) {
      repliesByPhone.set(m.user_phone, true);
    }
  });

  // Calculate template stats
  const templateStats = {};

  // Initialize stats from queue
  queueStats.forEach(item => {
    if (!item.template_name) return;

    if (!templateStats[item.template_name]) {
      templateStats[item.template_name] = {
        total: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0
      };
    }

    templateStats[item.template_name].total++;
  });

  // Add status counts from message_status_logs
  campaignMessages.forEach(msg => {
    const template = phoneToTemplate.get(msg.user_phone);
    if (!template) return;

    const latestStatus = messageLatestStatus.get(msg.whatsapp_message_id);
    if (!latestStatus) return;

    if (!templateStats[template]) {
      templateStats[template] = {
        total: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0
      };
    }

    // Count cumulative stats
    if (latestStatus.status === 'failed') {
      templateStats[template].failed++;
    } else {
      // Sent = all non-failed
      templateStats[template].sent++;

      // Delivered = delivered + read
      if (latestStatus.status === 'delivered' || latestStatus.status === 'read') {
        templateStats[template].delivered++;
      }

      // Read
      if (latestStatus.status === 'read') {
        templateStats[template].read++;
      }
    }

    // Check if user replied
    if (repliesByPhone.has(msg.user_phone)) {
      templateStats[template].replied++;
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
