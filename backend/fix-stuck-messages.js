/**
 * Fix Stuck Messages in Processing Status
 * Updates messages that are stuck in processing to sent status
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixStuckMessages() {
  try {
    console.log('🔧 Fixing stuck messages...\n');

    // Get test1 campaign ID
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, name, total_sent')
      .eq('name', 'test1')
      .single();

    console.log(`Campaign: ${campaign.name}`);
    console.log(`Total Sent (according to campaign): ${campaign.total_sent}\n`);

    // Get messages stuck in processing
    const { data: stuckMessages } = await supabase
      .from('send_queue')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'processing');

    console.log(`Found ${stuckMessages.length} messages stuck in "processing" status\n`);

    if (stuckMessages.length === 0) {
      console.log('✅ No stuck messages to fix!');
      return;
    }

    // Update all stuck messages to sent
    console.log('Updating messages to "sent" status...');
    const { error: updateError } = await supabase
      .from('send_queue')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('campaign_id', campaign.id)
      .eq('status', 'processing');

    if (updateError) {
      console.error('❌ Error updating messages:', updateError);
      return;
    }

    console.log('✅ Messages updated to "sent"\n');

    // Now check if campaign should be completed
    const { data: remainingPending } = await supabase
      .from('send_queue')
      .select('id')
      .eq('campaign_id', campaign.id)
      .in('status', ['ready', 'processing']);

    console.log(`Remaining pending messages: ${remainingPending?.length || 0}\n`);

    if (!remainingPending || remainingPending.length === 0) {
      console.log('Marking campaign as completed...');

      const { error: campaignError } = await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          end_time: new Date().toISOString()
        })
        .eq('id', campaign.id);

      if (campaignError) {
        console.error('❌ Error updating campaign:', campaignError);
      } else {
        console.log('✅ Campaign marked as completed!\n');
        console.log('🎉 All done! Check your dashboard - campaign should show as COMPLETED');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

fixStuckMessages();
