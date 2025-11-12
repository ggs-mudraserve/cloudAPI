#!/usr/bin/env node

/**
 * Restart Stuck Campaign Script
 *
 * This script restarts campaign a3acad26-d1b3-4cb9-b3f6-dc086fd7c8a6
 * which was prematurely marked complete without processing messages.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CAMPAIGN_ID = 'a3acad26-d1b3-4cb9-b3f6-dc086fd7c8a6';

async function restartCampaign() {
  console.log('🔄 Restarting Stuck Campaign\n');
  console.log(`Campaign ID: ${CAMPAIGN_ID}`);
  console.log(`Campaign Name: FIN NEW DATA 7 TO 8 NOV 2025 FILE 22\n`);

  // 1. Check current status
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (!campaign) {
    console.error('❌ Campaign not found');
    return;
  }

  console.log('Current Status:');
  console.log(`  - Status: ${campaign.status}`);
  console.log(`  - Total Contacts: ${campaign.total_contacts}`);
  console.log(`  - Total Sent: ${campaign.total_sent}`);
  console.log(`  - Total Failed: ${campaign.total_failed}\n`);

  // 2. Check send_queue
  const { count: readyCount } = await supabase
    .from('send_queue')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'ready');

  const { count: sentCount } = await supabase
    .from('send_queue')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'sent');

  const { count: failedCount } = await supabase
    .from('send_queue')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'failed');

  console.log('Send Queue Status:');
  console.log(`  - Ready: ${readyCount}`);
  console.log(`  - Sent: ${sentCount}`);
  console.log(`  - Failed: ${failedCount}\n`);

  if (readyCount === 0) {
    console.log('✅ No messages to process. Campaign is truly complete.');
    return;
  }

  // 3. Restart campaign
  console.log(`⚠️  Found ${readyCount} messages still in ready status!`);
  console.log('Restarting campaign...\n');

  const { error: updateError } = await supabase
    .from('campaigns')
    .update({
      status: 'running',
      start_time: new Date().toISOString(),
      end_time: null
    })
    .eq('id', CAMPAIGN_ID);

  if (updateError) {
    console.error('❌ Error restarting campaign:', updateError.message);
    return;
  }

  console.log('✅ Campaign restarted successfully!');
  console.log('\n📊 Monitor progress with:');
  console.log(`   node monitor-campaign.js ${CAMPAIGN_ID}`);
  console.log('\n📝 Check logs with:');
  console.log('   pm2 logs whatsapp-app');
}

restartCampaign().catch(console.error);
