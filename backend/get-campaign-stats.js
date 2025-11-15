const { supabase } = require('./src/config/supabase');

async function getCampaignStats(campaignId) {
  console.log('📊 Campaign Details Report');
  console.log('=========================\n');

  // 1. Get campaign basic info
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (!campaign) {
    console.log('❌ Campaign not found');
    return;
  }

  console.log('Campaign Information:');
  console.log('  ID: ' + campaign.id);
  console.log('  Name: ' + campaign.name);
  console.log('  Status: ' + campaign.status);
  console.log('  Created: ' + new Date(campaign.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
  console.log('  Started: ' + (campaign.start_time ? new Date(campaign.start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'));
  console.log('  Ended: ' + (campaign.end_time ? new Date(campaign.end_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'));
  console.log('  Total Contacts: ' + campaign.total_contacts);
  console.log('  Templates Used: ' + campaign.template_names.join(', ') + '\n');

  // 2. Get send queue statistics
  const { data: queueStats } = await supabase
    .from('send_queue')
    .select('status')
    .eq('campaign_id', campaignId);

  const queueStatusCount = queueStats.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  console.log('📤 Send Queue Status:');
  console.log('  Sent: ' + (queueStatusCount.sent || 0));
  console.log('  Failed: ' + (queueStatusCount.failed || 0));
  console.log('  Ready: ' + (queueStatusCount.ready || 0));
  console.log('  Processing: ' + (queueStatusCount.processing || 0));
  console.log('  Total: ' + queueStats.length + '\n');

  // 3. Get message status from messages table (for sent messages)
  const { data: messages } = await supabase
    .from('messages')
    .select('whatsapp_message_id, status')
    .eq('campaign_id', campaignId);

  console.log('📨 Messages Created: ' + (messages ? messages.length : 0) + '\n');

  let statusCount = {};

  // 4. Get detailed status from message_status_logs
  const messageIds = messages ? messages.map(m => m.whatsapp_message_id) : [];

  if (messageIds.length > 0) {
    // Get latest status for each message
    const { data: statusLogs } = await supabase
      .from('message_status_logs')
      .select('whatsapp_message_id, status, created_at')
      .in('whatsapp_message_id', messageIds)
      .order('created_at', { ascending: false });

    // Get latest status per message
    const latestStatus = {};
    if (statusLogs && statusLogs.length > 0) {
      if (!latestStatus[log.whatsapp_message_id]) {
        latestStatus[log.whatsapp_message_id] = log.status;
      }
    });

    statusCount = Object.values(latestStatus).reduce((acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
    }
      return acc;
    }, {});

    console.log('📊 Message Status (from WhatsApp):');
    console.log('  Sent: ' + (statusCount.sent || 0));
    console.log('  Delivered: ' + (statusCount.delivered || 0));
    console.log('  Read: ' + (statusCount.read || 0));
    console.log('  Failed: ' + (statusCount.failed || 0));
    console.log('  Total Tracked: ' + Object.keys(latestStatus).length + '\n');
  }

  // 5. Check for replies (incoming messages from campaign recipients)
  const { data: replies } = await supabase
    .from('messages')
    .select('id, user_phone, direction, message_type')
    .eq('campaign_id', campaignId)
    .eq('direction', 'incoming');

  console.log('💬 Replies Received: ' + (replies ? replies.length : 0) + '\n');

  // 6. Summary
  console.log('═══════════════════════════════════');
  console.log('📈 CAMPAIGN SUMMARY');
  console.log('═══════════════════════════════════');
  console.log('Total Contacts: ' + campaign.total_contacts);
  console.log('Successfully Sent: ' + (queueStatusCount.sent || 0));
  console.log('Failed to Send: ' + (queueStatusCount.failed || 0));
  console.log('Pending: ' + ((queueStatusCount.ready || 0) + (queueStatusCount.processing || 0)));
  console.log('Delivered (WhatsApp): ' + (statusCount.delivered || 0));
  console.log('Read (WhatsApp): ' + (statusCount.read || 0));
  console.log('Replies Received: ' + (replies ? replies.length : 0));
  console.log('═══════════════════════════════════\n');

  // Calculate rates
  const sent = queueStatusCount.sent || 0;
  const failed = queueStatusCount.failed || 0;
  const delivered = statusCount.delivered || 0;
  const read = statusCount.read || 0;
  const repliesCount = replies ? replies.length : 0;

  if (sent > 0) {
    console.log('📊 Success Rates:');
    console.log('  Delivery Rate: ' + ((delivered / sent) * 100).toFixed(2) + '%');
    console.log('  Read Rate: ' + ((read / sent) * 100).toFixed(2) + '%');
    console.log('  Reply Rate: ' + ((repliesCount / sent) * 100).toFixed(2) + '%');
    console.log('  Failure Rate: ' + ((failed / (sent + failed)) * 100).toFixed(2) + '%');
  }
}

// Main execution
(async () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('\n📋 Usage:');
    console.log('  node get-campaign-stats.js <campaign_id>\n');
    process.exit(0);
  }

  await getCampaignStats(args[0]);
  process.exit(0);
})();
