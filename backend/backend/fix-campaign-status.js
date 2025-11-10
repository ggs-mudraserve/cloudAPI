/**
 * Fix Campaign Status Script
 * Manually completes campaigns that have all messages sent
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixCampaignStatus() {
  try {
    console.log('🔍 Checking campaign status...\n');

    // Get test1 campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('name', 'test1')
      .single();

    if (campaignError) {
      console.error('Error fetching campaign:', campaignError);
      return;
    }

    console.log('Campaign Details:');
    console.log(`- ID: ${campaign.id}`);
    console.log(`- Name: ${campaign.name}`);
    console.log(`- Status: ${campaign.status}`);
    console.log(`- Total Contacts: ${campaign.total_contacts}`);
    console.log(`- Total Sent: ${campaign.total_sent}`);
    console.log(`- Total Failed: ${campaign.total_failed}`);
    console.log();

    // Check send_queue status
    const { data: queueMessages, error: queueError } = await supabase
      .from('send_queue')
      .select('id, phone, status, retry_count, error_message, sent_at')
      .eq('campaign_id', campaign.id);

    if (queueError) {
      console.error('Error fetching queue messages:', queueError);
      return;
    }

    console.log('Queue Messages:');
    queueMessages.forEach(msg => {
      console.log(`- Phone: ${msg.phone}, Status: ${msg.status}, Sent At: ${msg.sent_at || 'N/A'}`);
    });
    console.log();

    // Count by status
    const statusCounts = queueMessages.reduce((acc, msg) => {
      acc[msg.status] = (acc[msg.status] || 0) + 1;
      return acc;
    }, {});

    console.log('Status Breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`- ${status}: ${count}`);
    });
    console.log();

    // Check if all messages are sent or failed
    const pendingCount = (statusCounts['ready'] || 0) + (statusCounts['processing'] || 0);
    const completedCount = (statusCounts['sent'] || 0) + (statusCounts['failed'] || 0);

    console.log(`Pending messages: ${pendingCount}`);
    console.log(`Completed messages: ${completedCount}`);
    console.log();

    if (pendingCount === 0 && campaign.status === 'running') {
      console.log('✅ All messages processed, marking campaign as completed...');

      const { error: updateError } = await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          end_time: new Date().toISOString()
        })
        .eq('id', campaign.id);

      if (updateError) {
        console.error('❌ Error updating campaign:', updateError);
      } else {
        console.log('✅ Campaign marked as completed successfully!');
      }
    } else if (campaign.status === 'completed') {
      console.log('✅ Campaign is already marked as completed');
    } else {
      console.log(`⚠️  Campaign still has ${pendingCount} pending messages`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

fixCampaignStatus();
