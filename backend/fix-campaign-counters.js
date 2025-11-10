#!/usr/bin/env node

/**
 * Fix Campaign Counters
 * Recalculates and fixes campaign counters based on actual send_queue data
 *
 * Usage:
 *   node fix-campaign-counters.js [campaign_id]
 *   node fix-campaign-counters.js --all  (fixes all campaigns)
 */

const { supabase } = require('./src/config/supabase');

async function fixCampaignCounter(campaignId) {
  try {
    // Get campaign info
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, total_sent, total_failed')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error(`Campaign ${campaignId} not found`);
      return false;
    }

    // Get accurate count from send_queue
    const { count: actualSent } = await supabase
      .from('send_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'sent');

    const { count: actualFailed } = await supabase
      .from('send_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'failed');

    // Check if counters need fixing
    if (campaign.total_sent === actualSent && campaign.total_failed === (actualFailed || 0)) {
      console.log(`✅ Campaign "${campaign.name}" counters are already correct`);
      console.log(`   Sent: ${actualSent}, Failed: ${actualFailed || 0}`);
      return true;
    }

    console.log(`🔧 Fixing campaign "${campaign.name}"`);
    console.log(`   Old: Sent=${campaign.total_sent}, Failed=${campaign.total_failed}`);
    console.log(`   New: Sent=${actualSent}, Failed=${actualFailed || 0}`);

    // Update campaign counter
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        total_sent: actualSent,
        total_failed: actualFailed || 0
      })
      .eq('id', campaignId);

    if (updateError) {
      console.error('❌ Error updating campaign:', updateError);
      return false;
    }

    console.log(`✅ Campaign "${campaign.name}" counters fixed!\n`);
    return true;

  } catch (error) {
    console.error('Error fixing campaign counter:', error.message);
    return false;
  }
}

async function fixAllCampaigns() {
  try {
    console.log('Fetching all campaigns...\n');

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, name, status')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching campaigns:', error);
      return;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('No campaigns found.');
      return;
    }

    console.log(`Found ${campaigns.length} campaign(s)\n`);

    let fixed = 0;
    let alreadyCorrect = 0;
    let failed = 0;

    for (const campaign of campaigns) {
      const result = await fixCampaignCounter(campaign.id);
      if (result === true) {
        alreadyCorrect++;
      } else if (result === false) {
        failed++;
      } else {
        fixed++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total campaigns: ${campaigns.length}`);
    console.log(`Already correct: ${alreadyCorrect}`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Failed: ${failed}`);

  } catch (error) {
    console.error('Error processing campaigns:', error.message);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage:');
  console.log('  node fix-campaign-counters.js <campaign_id>');
  console.log('  node fix-campaign-counters.js --all');
  console.log('\nExample:');
  console.log('  node fix-campaign-counters.js 3d824b99-a638-4363-b720-22e476e51b6f');
  console.log('  node fix-campaign-counters.js --all');
  process.exit(1);
}

if (args[0] === '--all') {
  fixAllCampaigns().then(() => {
    process.exit(0);
  });
} else {
  const campaignId = args[0];
  fixCampaignCounter(campaignId).then(() => {
    process.exit(0);
  });
}
