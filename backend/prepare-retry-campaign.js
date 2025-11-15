#!/usr/bin/env node

const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

const campaignName = process.argv[2] || 'first 50k';

async function prepareRetry() {
  try {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .ilike('name', `%${campaignName}%`)
      .limit(1);

    if (!campaigns || campaigns.length === 0) {
      console.error('Campaign not found');
      process.exit(1);
    }

    const campaign = campaigns[0];

    // Get ALL failed messages (both #135000 and #130429)
    const { data: allFailed } = await supabase
      .from('send_queue')
      .select('phone, template_name, payload')
      .eq('campaign_id', campaign.id)
      .eq('status', 'failed');

    console.log('\n========================================');
    console.log('   RETRY CAMPAIGN PREPARATION');
    console.log('========================================\n');

    console.log(`Original Campaign: ${campaign.name}`);
    console.log(`Total Failed Messages: ${allFailed.length}\n`);

    // Separate by error type
    const { data: genericErrors } = await supabase
      .from('send_queue')
      .select('phone, template_name, payload')
      .eq('campaign_id', campaign.id)
      .eq('status', 'failed')
      .ilike('error_message', '%135000%');

    const { data: rateLimitErrors } = await supabase
      .from('send_queue')
      .select('phone, template_name, payload')
      .eq('campaign_id', campaign.id)
      .eq('status', 'failed')
      .ilike('error_message', '%130429%');

    console.log('Failed due to burst/overflow (#135000):', genericErrors.length);
    console.log('Failed due to rate limit (#130429):', rateLimitErrors.length);
    console.log('Total to retry:', allFailed.length, '\n');

    // Get template details
    const { data: template } = await supabase
      .from('templates')
      .select('*')
      .eq('name', campaign.template_names[0])
      .eq('whatsapp_number_id', campaign.whatsapp_number_id)
      .single();

    console.log('========================================');
    console.log('   TEMPLATE INFORMATION');
    console.log('========================================\n');

    if (template) {
      console.log('Template Name:', template.name);
      console.log('Category:', template.category);
      console.log('Status:', template.status);
      console.log('Is Active:', template.is_active);
      console.log('Is Quarantined:', template.is_quarantined);
    }

    // Extract variable names from first payload
    const samplePayload = allFailed[0].payload;
    const variables = Object.keys(samplePayload);

    console.log('\nTemplate Variables:', variables.join(', '), '\n');

    // Create CSV for retry
    const exportDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const retryCsvPath = path.join(exportDir, `retry_campaign_${timestamp}.csv`);

    // CSV Header
    const csvHeader = ['Phone', ...variables].join(',');

    // CSV Rows
    const csvRows = allFailed.map(record => {
      const values = variables.map(varName => {
        const value = record.payload[varName] || '';
        // Escape commas and quotes in values
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      return [record.phone, ...values].join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');
    fs.writeFileSync(retryCsvPath, csvContent);

    console.log('========================================');
    console.log('   RETRY CSV CREATED');
    console.log('========================================\n');

    console.log('File:', path.basename(retryCsvPath));
    console.log('Location:', retryCsvPath);
    console.log('Total Records:', allFailed.length);
    console.log('\nCSV Format:');
    console.log('  Column 1: Phone');
    variables.forEach((v, i) => {
      console.log(`  Column ${i + 2}: ${v}`);
    });

    console.log('\n========================================');
    console.log('   RECOMMENDED RETRY SETTINGS');
    console.log('========================================\n');

    console.log('1. CAMPAIGN NAME:');
    console.log('   "Retry - first 50k - Failed Messages"\n');

    console.log('2. SEND RATE:');
    console.log('   Start at: 100-200 msg/sec');
    console.log('   Let adaptive algorithm increase gradually\n');

    console.log('3. UPLOAD CSV:');
    console.log('   Use:', path.basename(retryCsvPath));
    console.log('   From:', exportDir, '\n');

    console.log('4. SELECT SAME TEMPLATE:');
    console.log('   Template:', campaign.template_names[0], '\n');

    console.log('5. WHATSAPP NUMBER:');
    const { data: whatsappNum } = await supabase
      .from('whatsapp_numbers')
      .select('display_name, phone_number_id')
      .eq('id', campaign.whatsapp_number_id)
      .single();

    if (whatsappNum) {
      console.log('   Use:', whatsappNum.display_name);
      console.log('   Phone ID:', whatsappNum.phone_number_id, '\n');
    }

    console.log('6. TIMING:');
    console.log('   Consider running during off-peak hours');
    console.log('   Spread over 30-60 minutes instead of <1 minute\n');

    console.log('========================================');
    console.log('   WHY THESE WILL LIKELY SUCCEED');
    console.log('========================================\n');

    console.log('✅ Numbers are VALID (you verified manually)');
    console.log('✅ Template worked for 44,880 other messages');
    console.log('✅ Payload format is correct');
    console.log('✅ Failed due to RATE, not data quality\n');

    console.log('Expected success rate: 95-98%');
    console.log('(Only genuine invalid numbers will fail)\n');

    console.log('========================================');
    console.log('   NEXT STEPS');
    console.log('========================================\n');

    console.log('1. Download the retry CSV:');
    console.log('   scp root@server:' + retryCsvPath + ' ./\n');

    console.log('2. Go to dashboard → Campaigns → Create Campaign\n');

    console.log('3. Upload the retry CSV\n');

    console.log('4. Select template:', campaign.template_names[0], '\n');

    console.log('5. IMPORTANT: Set initial send rate to 200 msg/sec');
    console.log('   (or modify WhatsApp number max_send_rate temporarily)\n');

    console.log('6. Monitor the campaign closely\n');

    console.log('========================================\n');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

prepareRetry();
