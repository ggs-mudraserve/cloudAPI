#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const campaignService = require('./src/services/campaignService');

// Configuration
const CSV_PATH = '/root/cloudAPI/exports/retry_campaign_2025-11-14.csv';

// Original campaign settings
const CAMPAIGN_CONFIG = {
  name: 'Retry - First 50k - Failed Messages',
  whatsapp_number_id: '141681c8-e32b-452b-8b1c-fa16b9e65b47',
  selected_templates: [
    '10_nov_2025_temp1',
    '12_nov_2025_temp2',
    '12_nov_2025_temp3',
    '12_nov_2025_temp4',
    '12_nov_2025_temp5',
    '12_nov_2025_temp6',
    '12_nov_2025_temp7'
  ],
  is_scheduled: false,
  use_template_media: false
};

async function createRetryCampaign() {
  try {
    console.log('\n========================================');
    console.log('   CREATING RETRY CAMPAIGN');
    console.log('========================================\n');

    // Check if CSV exists
    if (!fs.existsSync(CSV_PATH)) {
      console.error('❌ Error: CSV file not found at', CSV_PATH);
      process.exit(1);
    }

    const csvStats = fs.statSync(CSV_PATH);
    console.log('📄 CSV File:', path.basename(CSV_PATH));
    console.log('📊 File Size:', (csvStats.size / 1024 / 1024).toFixed(2), 'MB');

    // Count lines in CSV
    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const lineCount = csvContent.split('\n').filter(line => line.trim()).length;
    console.log('📞 Total Contacts:', lineCount - 1, '(excluding header)\n');

    console.log('Campaign Configuration:');
    console.log('  Name:', CAMPAIGN_CONFIG.name);
    console.log('  Templates:', CAMPAIGN_CONFIG.selected_templates.length, 'templates');
    console.log('  Templates:', CAMPAIGN_CONFIG.selected_templates.join(', '));
    console.log('  Start Mode: Immediate');
    console.log('  Max Send Rate: 200 msg/sec (capped)\n');

    console.log('🚀 Creating campaign...\n');

    // Read CSV content as buffer
    const csvBuffer = fs.readFileSync(CSV_PATH);

    // Create campaign using service
    const campaign = await campaignService.createCampaign(
      CAMPAIGN_CONFIG,
      {
        buffer: csvBuffer,
        originalname: path.basename(CSV_PATH),
        mimetype: 'text/csv'
      }
    );

    console.log('✅ Campaign created successfully!\n');
    console.log('Campaign Details:');
    console.log('  ID:', campaign.id);
    console.log('  Name:', campaign.name);
    console.log('  Status:', campaign.status);
    console.log('  Total Contacts:', campaign.total_contacts);
    console.log('  Invalid Contacts:', campaign.invalid_contacts_count);
    console.log('\n========================================');
    console.log('   CAMPAIGN STARTED!');
    console.log('========================================\n');
    console.log('💡 Monitor progress:');
    console.log('  - Open dashboard: https://dashboard.getfastloans.in');
    console.log('  - Go to Campaigns page');
    console.log('  - Click "View Details" on the campaign');
    console.log('  - Numbers will update in real-time every 2 seconds\n');
    console.log('Expected completion: ~30-35 minutes (at 200 msg/sec)');
    console.log('Expected success rate: 95-98% (only genuine invalid numbers will fail)\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error creating campaign:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

createRetryCampaign();
