const cron = require('node-cron');
require('dotenv').config();

const { supabase, testConnection } = require('./src/config/supabase');
const { enqueueMessages } = require('./src/services/campaignService');
const { notifyCampaignFailed } = require('./src/utils/notifications');

/**
 * Pre-flight validation for scheduled campaigns
 * Checks if templates are active and not MARKETING/AUTHENTICATION
 * Checks if WhatsApp number is active
 */
async function preFlightValidation(campaign) {
  const validationErrors = [];

  // Check WhatsApp number is active
  const { data: number, error: numberError } = await supabase
    .from('whatsapp_numbers')
    .select('is_active, display_name')
    .eq('id', campaign.whatsapp_number_id)
    .single();

  if (numberError || !number) {
    validationErrors.push('WhatsApp number not found');
    return { valid: false, errors: validationErrors };
  }

  if (!number.is_active) {
    validationErrors.push('WhatsApp number is not active (token may be expired)');
  }

  // Check all templates are active, not quarantined, and not MARKETING/AUTHENTICATION
  const { data: templates, error: templateError } = await supabase
    .from('templates')
    .select('name, category, is_active, is_quarantined')
    .eq('whatsapp_number_id', campaign.whatsapp_number_id)
    .in('name', campaign.template_names);

  if (templateError) {
    validationErrors.push('Failed to validate templates');
    return { valid: false, errors: validationErrors };
  }

  if (templates.length !== campaign.template_names.length) {
    validationErrors.push('One or more templates not found');
  }

  // Check each template
  templates.forEach(template => {
    if (!template.is_active) {
      validationErrors.push(`Template "${template.name}" is not active`);
    }
    if (template.is_quarantined) {
      validationErrors.push(`Template "${template.name}" is quarantined`);
    }
    if (template.category === 'MARKETING' || template.category === 'AUTHENTICATION') {
      validationErrors.push(`Template "${template.name}" has category ${template.category}`);
    }
  });

  return {
    valid: validationErrors.length === 0,
    errors: validationErrors
  };
}

/**
 * Process scheduled campaigns that are due to start
 * Runs every minute
 */
async function procesScheduledCampaigns() {
  try {
    const now = new Date().toISOString();

    // Find all scheduled campaigns that are due to start
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_start_time', now);

    if (error) {
      console.error('[Cron] Error fetching scheduled campaigns:', error);
      return;
    }

    if (!campaigns || campaigns.length === 0) {
      return; // No campaigns to process
    }

    console.log(`[Cron] Found ${campaigns.length} scheduled campaign(s) due to start`);

    for (const campaign of campaigns) {
      try {
        // Run pre-flight validation
        const validation = await preFlightValidation(campaign);

        if (!validation.valid) {
          // Validation failed - mark campaign as failed
          console.log(`[Cron] Campaign "${campaign.name}" failed pre-flight validation:`, validation.errors);

          await supabase
            .from('campaigns')
            .update({
              status: 'failed',
              end_time: new Date().toISOString()
            })
            .eq('id', campaign.id);

          // Create notification
          await notifyCampaignFailed(
            campaign.id,
            campaign.name,
            validation.errors.join('; ')
          );

          console.log(`[Cron] Campaign "${campaign.name}" marked as failed`);
          continue;
        }

        // Validation passed - enqueue messages and start campaign
        console.log(`[Cron] Campaign "${campaign.name}" passed pre-flight validation, enqueueing messages...`);

        // Get contact distribution from campaign_contacts
        const { data: contacts, error: contactsError } = await supabase
          .from('campaign_contacts')
          .select('phone, template_name, variables')
          .eq('campaign_id', campaign.id)
          .eq('is_valid', true);

        if (contactsError) {
          throw new Error(`Failed to fetch contacts: ${contactsError.message}`);
        }

        // Build distribution object
        const distribution = {};
        campaign.template_names.forEach(templateName => {
          distribution[templateName] = [];
        });

        contacts.forEach(contact => {
          if (distribution[contact.template_name]) {
            distribution[contact.template_name].push({
              phone: contact.phone,
              variables: contact.variables
            });
          }
        });

        // Enqueue messages
        await enqueueMessages(campaign.id, campaign.whatsapp_number_id, distribution, {});

        // Update campaign status to running
        await supabase
          .from('campaigns')
          .update({
            status: 'running',
            start_time: new Date().toISOString()
          })
          .eq('id', campaign.id);

        console.log(`[Cron] Campaign "${campaign.name}" started successfully`);

      } catch (campaignError) {
        console.error(`[Cron] Error processing campaign "${campaign.name}":`, campaignError);

        // Mark campaign as failed
        await supabase
          .from('campaigns')
          .update({
            status: 'failed',
            end_time: new Date().toISOString()
          })
          .eq('id', campaign.id);

        // Create notification
        await notifyCampaignFailed(
          campaign.id,
          campaign.name,
          campaignError.message || 'Unknown error'
        );
      }
    }

  } catch (error) {
    console.error('[Cron] Error in campaign scheduler:', error);
  }
}

/**
 * Cleanup old messages (90-day retention)
 * Runs daily at 3 AM IST
 */
async function cleanupOldMessages() {
  try {
    console.log('[Cron] Starting message cleanup (90-day retention)...');

    // Delete messages older than 90 days
    const { error: messagesError } = await supabase.rpc('delete_old_records', {
      table_name: 'messages',
      days: 90
    }).catch(() => {
      // Fallback to direct query if function doesn't exist
      return supabase
        .from('messages')
        .delete()
        .lt('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
    });

    if (messagesError) {
      console.error('[Cron] Error deleting old messages:', messagesError);
    } else {
      console.log('[Cron] Old messages deleted successfully');
    }

    // Delete message status logs older than 90 days
    const { error: logsError } = await supabase
      .from('message_status_logs')
      .delete()
      .lt('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

    if (logsError) {
      console.error('[Cron] Error deleting old message status logs:', logsError);
    } else {
      console.log('[Cron] Old message status logs deleted successfully');
    }

  } catch (error) {
    console.error('[Cron] Error in message cleanup:', error);
  }
}

/**
 * Cleanup old notifications (30-day retention)
 * Runs daily at 3 AM IST
 */
async function cleanupOldNotifications() {
  try {
    console.log('[Cron] Starting notification cleanup (30-day retention)...');

    const { error } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error('[Cron] Error deleting old notifications:', error);
    } else {
      console.log('[Cron] Old notifications deleted successfully');
    }

  } catch (error) {
    console.error('[Cron] Error in notification cleanup:', error);
  }
}

/**
 * Recover stuck messages in processing state
 * Runs every 5 minutes
 */
async function recoverStuckMessages() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('send_queue')
      .update({
        status: 'ready',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'processing')
      .lt('updated_at', fiveMinutesAgo)
      .select();

    if (error) {
      console.error('[Cron] Error recovering stuck messages:', error);
    } else if (data && data.length > 0) {
      console.log(`[Cron] Recovered ${data.length} stuck message(s)`);
    }

  } catch (error) {
    console.error('[Cron] Error in stuck message recovery:', error);
  }
}

/**
 * Start all cron jobs
 */
async function startCronJobs() {
  console.log('🕐 Starting cron jobs...');

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('❌ Failed to connect to database. Cron jobs not started.');
    process.exit(1);
  }

  // Campaign scheduler - every minute
  cron.schedule('* * * * *', () => {
    console.log('[Cron] Running campaign scheduler...');
    procesScheduledCampaigns();
  });

  // Stuck message recovery - every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    console.log('[Cron] Running stuck message recovery...');
    recoverStuckMessages();
  });

  // Cleanup jobs - daily at 3 AM IST (timezone set via TZ env variable)
  cron.schedule('0 3 * * *', () => {
    console.log('[Cron] Running daily cleanup jobs...');
    cleanupOldMessages();
    cleanupOldNotifications();
  });

  console.log('✅ Cron jobs started:');
  console.log('   - Campaign scheduler: every minute');
  console.log('   - Stuck message recovery: every 5 minutes');
  console.log('   - Cleanup jobs: daily at 3 AM IST');
  console.log(`⏰ Timezone: ${process.env.TZ || 'UTC'}`);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, shutting down cron worker...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('⚠️  SIGINT received, shutting down cron worker...');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception in cron worker:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection in cron worker:', promise, 'reason:', reason);
});

// Start cron jobs
startCronJobs();
