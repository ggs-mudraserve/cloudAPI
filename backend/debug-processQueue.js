const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('http://localhost:8000', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTYzOTk2MTIsImV4cCI6MjA3MTc1OTYxMn0.8vwMwbB_VU6Qsul07ev7cfeAHI1qsFIBUJ_x5bds3tU');

// Import the module to see its state
const queueProcessor = require('./src/services/queueProcessor');

async function debugProcessQueue() {
  // Get all running campaigns
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, whatsapp_number_id')
    .eq('status', 'running')
    .order('created_at', { ascending: true });

  if (error || !campaigns || campaigns.length === 0) {
    console.log('No running campaigns found');
    return;
  }

  console.log(`Found ${campaigns.length} running campaigns`);

  // Group campaigns by WhatsApp number
  const campaignsByNumber = new Map();
  campaigns.forEach(campaign => {
    if (!campaignsByNumber.has(campaign.whatsapp_number_id)) {
      campaignsByNumber.set(campaign.whatsapp_number_id, []);
    }
    campaignsByNumber.get(campaign.whatsapp_number_id).push(campaign.id);
  });

  console.log('\nCampaigns grouped by WhatsApp number:');
  for (const [numberId, campaignIds] of campaignsByNumber) {
    console.log(`  Number ${numberId}: ${campaignIds.length} campaigns`);
    console.log(`    Campaign IDs:`, campaignIds);

    // This is the check that processQueue does
    // We need to access the internal rateControlState, but it's not exported
    // So let's just show what SHOULD happen
    console.log(`    Should check: if (!rateState || !rateState.isProcessing)`);
    console.log(`    If true, should call processCampaignQueue('${campaignIds[0]}')`);
  }

  console.log('\nThe issue: rateControlState is module-private, so we cannot inspect it here.');
  console.log('We need to add logging INSIDE processQueue to see why it is not calling processCampaignQueue.');
}

debugProcessQueue().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
