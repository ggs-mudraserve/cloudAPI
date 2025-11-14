const campaignService = require('../services/campaignService');
const { supabase } = require('../config/supabase');

/**
 * Create new campaign with CSV upload
 * Handles multipart/form-data with file and campaign metadata
 */
exports.createCampaign = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    // Parse campaign metadata from form fields
    const { name, whatsapp_number_id, template_names, scheduled_start_time, is_scheduled } = req.body;

    // Validation
    if (!name || !whatsapp_number_id || !template_names) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, whatsapp_number_id, template_names'
      });
    }

    // Parse template_names (comes as string from form data)
    let parsedTemplateNames;
    try {
      parsedTemplateNames = JSON.parse(template_names);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'template_names must be a valid JSON array'
      });
    }

    if (!Array.isArray(parsedTemplateNames) || parsedTemplateNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one template must be selected'
      });
    }

    // Validate templates exist, are active, not quarantined, and not MARKETING
    const { data: templates, error: templateError } = await supabase
      .from('templates')
      .select('name, category, is_active, is_quarantined')
      .eq('whatsapp_number_id', whatsapp_number_id)
      .in('name', parsedTemplateNames);

    if (templateError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to validate templates'
      });
    }

    if (templates.length !== parsedTemplateNames.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more templates not found for this WhatsApp number'
      });
    }

    // Check template eligibility
    const ineligibleTemplates = templates.filter(
      t => !t.is_active || t.is_quarantined || t.category === 'MARKETING'
    );

    if (ineligibleTemplates.length > 0) {
      const reasons = ineligibleTemplates.map(t => {
        if (!t.is_active) return `${t.name}: inactive`;
        if (t.is_quarantined) return `${t.name}: quarantined`;
        if (t.category === 'MARKETING') return `${t.name}: MARKETING category`;
        return t.name;
      });

      return res.status(400).json({
        success: false,
        message: 'Some templates are not eligible for campaigns',
        ineligible_templates: reasons
      });
    }

    // Validate WhatsApp number is active
    const { data: number, error: numberError } = await supabase
      .from('whatsapp_numbers')
      .select('is_active')
      .eq('id', whatsapp_number_id)
      .single();

    if (numberError || !number) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp number not found'
      });
    }

    if (!number.is_active) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp number is not active'
      });
    }

    // Process CSV and create campaign
    const campaignData = {
      name,
      whatsapp_number_id,
      template_names: parsedTemplateNames,
      scheduled_start_time: scheduled_start_time || null,
      is_scheduled: is_scheduled === 'true' || is_scheduled === true
    };

    const result = await campaignService.createCampaign(campaignData, req.file.buffer);

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: result
    });

  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create campaign'
    });
  }
};

/**
 * List campaigns with filters
 */
exports.listCampaigns = async (req, res) => {
  try {
    const filters = {
      whatsapp_number_id: req.query.whatsapp_number_id,
      status: req.query.status
    };

    const campaigns = await campaignService.listCampaigns(filters);

    res.json({
      success: true,
      data: campaigns
    });

  } catch (error) {
    console.error('List campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list campaigns'
    });
  }
};

/**
 * Get single campaign details
 */
exports.getCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await campaignService.getCampaign(id);

    res.json({
      success: true,
      data: campaign
    });

  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get campaign'
    });
  }
};

/**
 * Delete scheduled campaign
 */
exports.deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    await campaignService.deleteCampaign(id);

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });

  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to delete campaign'
    });
  }
};

/**
 * Stop/pause running campaign
 */
exports.stopCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await campaignService.stopCampaign(id);

    res.json({
      success: true,
      message: 'Campaign stopped successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Stop campaign error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to stop campaign'
    });
  }
};

/**
 * Resume paused campaign
 */
exports.resumeCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await campaignService.resumeCampaign(id);

    res.json({
      success: true,
      message: 'Campaign resumed successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Resume campaign error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to resume campaign'
    });
  }
};

/**
 * Get campaign statistics
 */
exports.getCampaignStats = async (req, res) => {
  try {
    const { whatsapp_number_id, status, start_date, end_date } = req.query;

    // Build query for campaigns with filters
    let campaignsQuery = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (whatsapp_number_id) {
      campaignsQuery = campaignsQuery.eq('whatsapp_number_id', whatsapp_number_id);
    }

    if (status) {
      campaignsQuery = campaignsQuery.eq('status', status);
    }

    if (start_date && end_date) {
      campaignsQuery = campaignsQuery
        .gte('created_at', start_date)
        .lte('created_at', end_date);
    }

    const { data: campaigns, error: campaignsError } = await campaignsQuery;

    if (campaignsError) throw campaignsError;

    if (!campaigns || campaigns.length === 0) {
      return res.json({
        success: true,
        data: {
          total_campaigns: 0,
          running: 0,
          scheduled: 0,
          completed: 0,
          paused: 0,
          failed: 0,
          total_contacts: 0,
          total_sent: 0,
          total_failed: 0,
          message_stats: {
            sent: { count: 0, percentage: 0 },
            delivered: { count: 0, percentage: 0 },
            read: { count: 0, percentage: 0 },
            replied: { count: 0, percentage: 0 },
            failed: { count: 0, percentage: 0 }
          }
        }
      });
    }

    // Extract campaign IDs for message queries
    const campaignIds = campaigns.map(c => c.id);

    // Get message status statistics from message_status_logs (filtered by campaign IDs)
    let statusLogsQuery = supabase
      .from('message_status_logs')
      .select('status, campaign_id')
      .not('campaign_id', 'is', null);

    if (campaignIds.length > 0) {
      statusLogsQuery = statusLogsQuery.in('campaign_id', campaignIds);
    } else {
      // No campaigns match filters, return empty stats
      return res.json({
        success: true,
        data: {
          total_campaigns: 0,
          running: 0,
          scheduled: 0,
          completed: 0,
          paused: 0,
          failed: 0,
          total_contacts: 0,
          total_sent: 0,
          total_failed: 0,
          message_stats: {
            sent: { count: 0, percentage: 0 },
            delivered: { count: 0, percentage: 0 },
            read: { count: 0, percentage: 0 },
            replied: { count: 0, percentage: 0 }, // Unique users who replied
            failed: { count: 0, percentage: 0 }
          }
        }
      });
    }

    const { data: statusLogs, error: statusError } = await statusLogsQuery;

    if (statusError) throw statusError;

    // FIXED: Get full message status logs with whatsapp_message_id to count unique messages
    // Fetch ALL status logs using pagination to avoid the 1000 limit
    let fullStatusLogs = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore && campaignIds.length > 0) {
      let fullStatusLogsQuery = supabase
        .from('message_status_logs')
        .select('whatsapp_message_id, status, created_at')
        .in('campaign_id', campaignIds)
        .range(from, from + batchSize - 1);

      const { data: batch, error: batchError } = await fullStatusLogsQuery;

      if (batchError) throw batchError;

      if (batch && batch.length > 0) {
        fullStatusLogs = fullStatusLogs.concat(batch);
        from += batchSize;
        hasMore = batch.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    // Get latest status for each unique message
    const messageLatestStatus = new Map();
    (fullStatusLogs || []).forEach(log => {
      const existing = messageLatestStatus.get(log.whatsapp_message_id);
      if (!existing || new Date(log.created_at) > new Date(existing.created_at)) {
        messageLatestStatus.set(log.whatsapp_message_id, log);
      }
    });

    // Count unique messages by their LATEST status
    let latestSent = 0;        // Still at "sent" status (not yet delivered)
    let latestDelivered = 0;   // Reached "delivered" status (not yet read)
    let latestRead = 0;        // Reached "read" status
    let latestFailed = 0;      // Failed

    messageLatestStatus.forEach(log => {
      if (log.status === 'sent') latestSent++;
      else if (log.status === 'delivered') latestDelivered++;
      else if (log.status === 'read') latestRead++;
      else if (log.status === 'failed') latestFailed++;
    });

    // Get failed messages from send_queue (messages that failed during sending)
    let sendQueueFailed = 0;
    let fromSendQueue = 0;
    let hasMoreSendQueue = true;

    while (hasMoreSendQueue && campaignIds.length > 0) {
      const { data: batch, error: sendQueueError } = await supabase
        .from('send_queue')
        .select('status')
        .in('campaign_id', campaignIds)
        .eq('status', 'failed')
        .range(fromSendQueue, fromSendQueue + batchSize - 1);

      if (sendQueueError) throw sendQueueError;

      if (batch && batch.length > 0) {
        sendQueueFailed += batch.length;
        fromSendQueue += batchSize;
        hasMoreSendQueue = batch.length === batchSize;
      } else {
        hasMoreSendQueue = false;
      }
    }

    // FIXED LOGIC:
    // "Sent" = All messages successfully sent from send_queue (total_sent from campaigns)
    // "Delivered" = Messages that reached at least "delivered" status (delivered + read)
    // "Read" = Messages that were read
    // "Failed" = Failed from both send_queue and message_status_logs
    // All percentages calculated as: count / total_contacts * 100
    
    const totalContacts = campaigns.reduce((sum, c) => sum + (c.total_contacts || 0), 0);
    const totalSent = campaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0);
    const totalFailed = sendQueueFailed; // Failed during sending
    
    const deliveredCount = latestDelivered + latestRead;  // At least delivered
    const readCount = latestRead;                         // Read
    const failedCount = latestFailed + sendQueueFailed;  // Failed from both sources

    // Get replied count (incoming messages from users who received campaign messages)
    // Fetch ALL campaign messages using pagination
    let campaignMessageIds = [];
    let fromCampaignMsg = 0;
    let hasMoreCampaignMsg = true;

    while (hasMoreCampaignMsg && campaignIds.length > 0) {
      let campaignMessagesQuery = supabase
        .from('messages')
        .select('user_phone, whatsapp_number_id')
        .eq('direction', 'outgoing')
        .in('campaign_id', campaignIds)
        .range(fromCampaignMsg, fromCampaignMsg + batchSize - 1);

      const { data: batch } = await campaignMessagesQuery;

      if (batch && batch.length > 0) {
        campaignMessageIds = campaignMessageIds.concat(batch);
        fromCampaignMsg += batchSize;
        hasMoreCampaignMsg = batch.length === batchSize;
      } else {
        hasMoreCampaignMsg = false;
      }
    }

    // Get unique user conversations from campaign messages
    const campaignUsers = new Set(
      campaignMessageIds.map(m => `${m.whatsapp_number_id}_${m.user_phone}`)
    );

    // Fetch ALL incoming messages using pagination
    let incomingMessages = [];
    let fromIncoming = 0;
    let hasMoreIncoming = true;

    while (hasMoreIncoming) {
      let incomingMessagesQuery = supabase
        .from('messages')
        .select('user_phone, whatsapp_number_id')
        .eq('direction', 'incoming')
        .range(fromIncoming, fromIncoming + batchSize - 1);

      const { data: batch } = await incomingMessagesQuery;

      if (batch && batch.length > 0) {
        incomingMessages = incomingMessages.concat(batch);
        fromIncoming += batchSize;
        hasMoreIncoming = batch.length === batchSize;
      } else {
        hasMoreIncoming = false;
      }
    }

    // Get unique phone numbers who replied at least once
    const uniqueRepliers = new Set();
    incomingMessages.forEach(m => {
      if (campaignUsers.has(`${m.whatsapp_number_id}_${m.user_phone}`)) {
        uniqueRepliers.add(`${m.whatsapp_number_id}_${m.user_phone}`);
      }
    });
    const repliedCount = uniqueRepliers.size;

    // Calculate percentages correctly:
    // All percentages use total_contacts as denominator
    const sentPercentage = totalContacts > 0 ? Math.round((totalSent / totalContacts) * 100) : 0;
    const deliveredPercentage = totalContacts > 0 ? Math.round((deliveredCount / totalContacts) * 100) : 0;
    const readPercentage = totalContacts > 0 ? Math.round((readCount / totalContacts) * 100) : 0;
    const repliedPercentage = totalContacts > 0 ? Math.round((repliedCount / totalContacts) * 100) : 0;
    const failedPercentage = totalContacts > 0 ? Math.round((failedCount / totalContacts) * 100) : 0;

    const stats = {
      // Campaign-level stats
      total_campaigns: campaigns.length,
      running: campaigns.filter(c => c.status === 'running').length,
      scheduled: campaigns.filter(c => c.status === 'scheduled').length,
      completed: campaigns.filter(c => c.status === 'completed').length,
      paused: campaigns.filter(c => c.status === 'paused').length,
      failed: campaigns.filter(c => c.status === 'failed').length,
      total_contacts: totalContacts,
      total_sent: totalSent,
      total_failed: campaigns.reduce((sum, c) => sum + (c.total_failed || 0), 0),

      // Message-level stats with correct percentages
      message_stats: {
        sent: {
          count: totalSent, // Total successfully sent from campaigns table
          percentage: sentPercentage
        },
        delivered: {
          count: deliveredCount, // At least delivered (delivered + read)
          percentage: deliveredPercentage
        },
        read: {
          count: readCount, // Read messages
          percentage: readPercentage
        },
        replied: {
          count: repliedCount, // Unique users who replied
          percentage: repliedPercentage
        },
        failed: {
          count: failedCount, // Failed from both sources
          percentage: failedPercentage
        }
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get campaign stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get campaign statistics',
      error: error.message
    });
  }
};
