#!/usr/bin/env node

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const API_BASE_URL = 'http://localhost:8080/api';
const CSV_PATH = '/root/cloudAPI/exports/retry_campaign_2025-11-14.csv';

// Original campaign settings
const CAMPAIGN_CONFIG = {
  name: 'Retry - First 50k - Failed Messages',
  whatsapp_number_id: '141681c8-e32b-452b-8b1c-fa16b9e65b47',
  template_names: [
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

    // Create form data
    const form = new FormData();
    form.append('name', CAMPAIGN_CONFIG.name);
    form.append('whatsapp_number_id', CAMPAIGN_CONFIG.whatsapp_number_id);
    form.append('selected_templates', JSON.stringify(CAMPAIGN_CONFIG.template_names));
    form.append('is_scheduled', String(CAMPAIGN_CONFIG.is_scheduled));
    form.append('use_template_media', String(CAMPAIGN_CONFIG.use_template_media));
    form.append('csv', fs.createReadStream(CSV_PATH));

    console.log('Campaign Configuration:');
    console.log('  Name:', CAMPAIGN_CONFIG.name);
    console.log('  Templates:', CAMPAIGN_CONFIG.template_names.length, 'templates');
    console.log('  Templates:', CAMPAIGN_CONFIG.template_names.join(', '));
    console.log('  Start Mode: Immediate');
    console.log('  Max Send Rate: 200 msg/sec (capped)\n');

    console.log('🚀 Creating campaign...\n');

    // Make API request
    const response = await axios.post(
      `${API_BASE_URL}/campaigns`,
      form,
      {
        headers: {
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    if (response.data.success) {
      console.log('✅ Campaign created successfully!\n');
      console.log('Campaign Details:');
      console.log('  ID:', response.data.data.id);
      console.log('  Name:', response.data.data.name);
      console.log('  Status:', response.data.data.status);
      console.log('  Total Contacts:', response.data.data.total_contacts);
      console.log('  Invalid Contacts:', response.data.data.invalid_contacts_count);
      console.log('\n========================================');
      console.log('   CAMPAIGN STARTED!');
      console.log('========================================\n');
      console.log('💡 Monitor progress:');
      console.log('  - Open dashboard: https://dashboard.getfastloans.in');
      console.log('  - Go to Campaigns page');
      console.log('  - Click "View Details" on the campaign\n');
      console.log('Expected completion: ~30 minutes (at 200 msg/sec)');
      console.log('Expected success rate: 95-98% (only genuine invalid numbers will fail)\n');
    } else {
      console.error('❌ Campaign creation failed:', response.data.message);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error creating campaign:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Message:', error.response.data?.message || error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

createRetryCampaign();
