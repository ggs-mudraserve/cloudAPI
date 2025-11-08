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

    // Build campaigns query with filters
    let campaignsQuery = supabase
      .from('campaigns')
      .select('id, status, total_contacts, total_sent, total_failed, whatsapp_number_id, created_at');

    // Apply filters
    if (whatsapp_number_id) {
      campaignsQuery = campaignsQuery.eq('whatsapp_number_id', whatsapp_number_id);
    }

    if (status) {
      campaignsQuery = campaignsQuery.eq('status', status);
    }

    if (start_date) {
      campaignsQuery = campaignsQuery.gte('created_at', start_date);
    }

    if (end_date) {
      // Add one day to end_date to include the entire day
      const endDateTime = new Date(end_date);
      endDateTime.setDate(endDateTime.getDate() + 1);
      campaignsQuery = campaignsQuery.lt('created_at', endDateTime.toISOString());
    }

    const { data: campaigns, error: campaignError } = await campaignsQuery;

    if (campaignError) throw campaignError;

    // Get campaign IDs for filtering message stats
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

    // Count messages by status
    const sentCount = statusLogs.filter(log => log.status === 'sent').length;
    const deliveredCount = statusLogs.filter(log => log.status === 'delivered').length;
    const readCount = statusLogs.filter(log => log.status === 'read').length;
    const failedCount = statusLogs.filter(log => log.status === 'failed').length;

    // Get total campaign messages sent
    const totalMessages = campaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0);

    // Get replied count (incoming messages from users who received campaign messages)
    let campaignMessagesQuery = supabase
      .from('messages')
      .select('user_phone, whatsapp_number_id')
      .eq('direction', 'outgoing')
      .not('campaign_id', 'is', null);

    if (campaignIds.length > 0) {
      campaignMessagesQuery = campaignMessagesQuery.in('campaign_id', campaignIds);
    }

    const { data: campaignMessageIds } = await campaignMessagesQuery;

    // Get unique user conversations from campaign messages
    const campaignUsers = new Set(
      (campaignMessageIds || []).map(m => `${m.whatsapp_number_id}_${m.user_phone}`)
    );

    // Count unique users who replied (not total reply messages)
    const { data: incomingMessages } = await supabase
      .from('messages')
      .select('user_phone, whatsapp_number_id')
      .eq('direction', 'incoming');

    // Get unique phone numbers who replied at least once
    const uniqueRepliers = new Set();
    (incomingMessages || []).forEach(m => {
      if (campaignUsers.has(`${m.whatsapp_number_id}_${m.user_phone}`)) {
        uniqueRepliers.add(`${m.whatsapp_number_id}_${m.user_phone}`);
      }
    });
    const repliedCount = uniqueRepliers.size;

    // Calculate percentages correctly:
    // - Sent %: based on total_contacts
    // - Delivered %: based on sent
    // - Read %: based on sent
    // - Replied %: based on sent (unique users who replied)
    // - Failed %: based on total_contacts

    const totalContacts = campaigns.reduce((sum, c) => sum + (c.total_contacts || 0), 0);

    const sentPercentage = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;
    const deliveredPercentage = sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0;
    const readPercentage = sentCount > 0 ? Math.round((readCount / sentCount) * 100) : 0;
    const repliedPercentage = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;
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
      total_sent: totalMessages,
      total_failed: campaigns.reduce((sum, c) => sum + (c.total_failed || 0), 0),

      // Message-level stats with correct percentages
      message_stats: {
        sent: {
          count: sentCount,
          percentage: sentPercentage
        },
        delivered: {
          count: deliveredCount,
          percentage: deliveredPercentage
        },
        read: {
          count: readCount,
          percentage: readPercentage
        },
        replied: {
          count: repliedCount,
          percentage: repliedPercentage
        },
        failed: {
          count: failedCount,
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
      message: 'Failed to get campaign statistics'
    });
  }
};
