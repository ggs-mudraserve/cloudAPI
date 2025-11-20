const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const campaignId = 'b0e103b2-07ba-4863-b6fc-e8f3d0cb624e';

async function fixStuckCampaign() {
  console.log('=== FIXING STUCK CAMPAIGN ===');
  console.log('Campaign ID:', campaignId);

  // Check current template index
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('current_template_index, template_names')
    .eq('id', campaignId)
    .single();

  if (campaignError) {
    console.error('Error fetching campaign:', campaignError);
    return;
  }

  console.log('\n=== CURRENT STATE ===');
  console.log('Current template index:', campaign.current_template_index);
  console.log('Template names:', campaign.template_names);
  console.log('Total templates:', campaign.template_names?.length || 0);

  // Check which templates have stuck messages
  const { data: templateStats, error: statsError } = await supabase
    .from('send_queue')
    .select('template_order, status')
    .eq('campaign_id', campaignId)
    .in('status', ['ready', 'processing']);

  if (!statsError && templateStats) {
    const templateCounts = {};
    templateStats.forEach(item => {
      const key = `Template ${item.template_order}`;
      templateCounts[key] = (templateCounts[key] || 0) + 1;
    });

    console.log('\n=== STUCK MESSAGES BY TEMPLATE ===');
    Object.entries(templateCounts).forEach(([template, count]) => {
      console.log(`${template}: ${count} messages stuck`);
    });

    // Find the lowest template index with stuck messages
    const stuckTemplateOrders = [...new Set(templateStats.map(s => s.template_order))].sort((a, b) => a - b);
    const lowestStuckTemplate = stuckTemplateOrders[0];

    if (lowestStuckTemplate !== undefined && lowestStuckTemplate < campaign.current_template_index) {
      console.log(`\n=== ISSUE FOUND ===`);
      console.log(`Campaign is at template index ${campaign.current_template_index}, but template ${lowestStuckTemplate} has stuck messages`);
      console.log(`Resetting current_template_index to ${lowestStuckTemplate} to process stuck messages...`);

      // Reset the template index to process stuck messages
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({ current_template_index: lowestStuckTemplate })
        .eq('id', campaignId);

      if (updateError) {
        console.error('Error updating campaign:', updateError);
      } else {
        console.log('✅ Campaign template index reset successfully!');
        console.log('The queue processor should now pick up the stuck messages on the next poll.');
      }
    } else {
      console.log('\n=== NO ISSUE FOUND ===');
      console.log('Template index appears correct. Checking for other issues...');

      // Check if messages are truly stuck (no recent updates)
      const { data: recentMessages } = await supabase
        .from('send_queue')
        .select('id, updated_at, status')
        .eq('campaign_id', campaignId)
        .eq('status', 'ready')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (recentMessages && recentMessages.length > 0) {
        const lastUpdate = new Date(recentMessages[0].updated_at);
        const now = new Date();
        const minutesSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60));

        console.log(`\nLast message update was ${minutesSinceUpdate} minutes ago`);

        if (minutesSinceUpdate > 15) {
          console.log('Messages appear to be genuinely stuck. Consider restarting the PM2 process:');
          console.log('  pm2 restart whatsapp-app');
        }
      }
    }
  }

  // Also check for any error patterns in recent logs
  console.log('\n=== CHECKING FOR RATE LIMIT ISSUES ===');
  const { data: failedMessages } = await supabase
    .from('send_queue')
    .select('error_message')
    .eq('campaign_id', campaignId)
    .eq('status', 'failed')
    .not('error_message', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (failedMessages && failedMessages.length > 0) {
    const errorTypes = {};
    failedMessages.forEach(msg => {
      const errorKey = msg.error_message?.includes('135000') ? 'Generic user error (135000)' :
                       msg.error_message?.includes('429') ? 'Rate limit exceeded (429)' :
                       'Other error';
      errorTypes[errorKey] = (errorTypes[errorKey] || 0) + 1;
    });

    console.log('Recent error patterns:');
    Object.entries(errorTypes).forEach(([error, count]) => {
      console.log(`  ${error}: ${count} occurrences`);
    });

    if (errorTypes['Generic user error (135000)'] > 5) {
      console.log('\n⚠️  High number of 135000 errors detected!');
      console.log('This usually indicates issues with WhatsApp number verification or template problems.');
    }
  }
}

fixStuckCampaign().catch(console.error);