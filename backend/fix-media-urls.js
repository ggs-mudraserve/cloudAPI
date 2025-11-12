#!/usr/bin/env node

/**
 * Fix Media URLs for Failed Campaigns
 *
 * This script updates all failed/ready messages to use the WhatsApp-approved
 * CDN URL from the template instead of the external S3 URL.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function fixMediaURLs() {
  console.log('🔧 Fixing Media URLs for Failed Campaigns\n');

  // Get the approved URLs from templates
  const templates = {
    '10_nov_2025_temp1': {
      whatsapp_number_id: '9ded5405-43c5-4973-879f-f692ded2d0c4',
      approvedUrl: null
    },
    '10_nov_2025_temp_bajaj1': {
      whatsapp_number_id: 'd07855e2-ce19-425f-af8b-8e72993e5af5',
      approvedUrl: null
    }
  };

  // Fetch approved URLs from templates
  for (const [templateName, info] of Object.entries(templates)) {
    const { data: template } = await supabase
      .from('templates')
      .select('components')
      .eq('name', templateName)
      .eq('whatsapp_number_id', info.whatsapp_number_id)
      .single();

    if (template) {
      const headerComponent = template.components.find(c => c.type === 'HEADER');
      if (headerComponent && headerComponent.example && headerComponent.example.header_handle) {
        info.approvedUrl = headerComponent.example.header_handle[0];
      }
    }
  }

  console.log('✅ Fetched approved URLs from templates:\n');
  for (const [name, info] of Object.entries(templates)) {
    console.log(`${name}:`);
    console.log(`  ${info.approvedUrl}\n`);
  }

  // Get all failed campaigns that need fixing
  const failedCampaignIds = [
    'a3acad26-d1b3-4cb9-b3f6-dc086fd7c8a6', // FIN NEW DATA (d07855e2)
    '5a5c39a6-d038-47c5-8c6c-421a7c1afdf3', // Bajaj_market_2 (d07855e2)
    '502ce508-9cfd-407a-86ca-b07cd3138b4a', // FIN NEW DATA (9ded5405)
    '906ec36e-4758-4a16-9a0c-7744d7521e12'  // Bajaj_market_2 (9ded5405)
  ];

  let totalFixed = 0;

  for (const campaignId of failedCampaignIds) {
    // Get campaign details
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('name, template_names, whatsapp_number_id')
      .eq('id', campaignId)
      .single();

    if (!campaign) continue;

    const templateName = campaign.template_names[0];
    const approvedUrl = templates[templateName]?.approvedUrl;

    if (!approvedUrl) {
      console.log(`⚠️  No approved URL found for template ${templateName}, skipping campaign ${campaignId}`);
      continue;
    }

    console.log(`\nProcessing campaign: ${campaign.name}`);
    console.log(`  Template: ${templateName}`);
    console.log(`  Using URL: ${approvedUrl.substring(0, 80)}...`);

    // Get messages that need fixing
    const { data: messages } = await supabase
      .from('send_queue')
      .select('id, payload, status')
      .eq('campaign_id', campaignId)
      .in('status', ['ready', 'failed']);

    console.log(`  Found ${messages?.length || 0} messages to fix`);

    if (!messages || messages.length === 0) continue;

    // Update each message
    let fixed = 0;
    for (const msg of messages) {
      const newPayload = {
        ...msg.payload,
        var1: approvedUrl  // Replace S3 URL with WhatsApp CDN URL
      };

      const { error } = await supabase
        .from('send_queue')
        .update({
          payload: newPayload,
          status: 'ready',
          retry_count: 0,
          error_message: null,
          next_retry_at: null
        })
        .eq('id', msg.id);

      if (!error) {
        fixed++;
        if (fixed % 100 === 0) {
          console.log(`    Progress: ${fixed}/${messages.length}`);
        }
      }
    }

    console.log(`  ✅ Fixed ${fixed} messages`);
    totalFixed += fixed;

    // Restart campaign if it's completed/paused
    if (campaign.status !== 'running') {
      await supabase
        .from('campaigns')
        .update({
          status: 'running',
          start_time: new Date().toISOString(),
          end_time: null,
          total_failed: 0  // Reset counters
        })
        .eq('id', campaignId);

      console.log(`  🔄 Campaign restarted`);
    }
  }

  console.log(`\n✅ COMPLETE: Fixed ${totalFixed} total messages across all campaigns`);
  console.log('\n📊 Next Steps:');
  console.log('  1. Monitor campaigns with: pm2 logs whatsapp-app');
  console.log('  2. Check progress: node monitor-campaign.js <campaign-id>');
  console.log('  3. Messages should now send successfully using WhatsApp CDN URLs');
}

fixMediaURLs().catch(console.error);
