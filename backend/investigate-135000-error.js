#!/usr/bin/env node

/**
 * Investigate WhatsApp Error #135000
 *
 * This script investigates why campaign 5a5c39a6-d038-47c5-8c6c-421a7c1afdf3
 * had all messages fail with error code 135000 "Generic user error"
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CAMPAIGN_ID = '5a5c39a6-d038-47c5-8c6c-421a7c1afdf3';
const WHATSAPP_API_BASE = 'https://graph.facebook.com/v17.0';

async function investigate() {
  console.log('🔍 Investigating WhatsApp Error #135000\n');
  console.log(`Campaign ID: ${CAMPAIGN_ID}`);
  console.log(`Campaign Name: Bajaj_market_2\n`);

  // 1. Get campaign details
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, whatsapp_numbers(*)')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (!campaign) {
    console.error('❌ Campaign not found');
    return;
  }

  console.log('Campaign Details:');
  console.log(`  - WhatsApp Number: ${campaign.whatsapp_numbers.display_name}`);
  console.log(`  - Phone Number ID: ${campaign.whatsapp_numbers.phone_number_id}`);
  console.log(`  - Template: ${campaign.template_names[0]}\n`);

  // 2. Get template details
  const { data: template } = await supabase
    .from('templates')
    .select('*')
    .eq('whatsapp_number_id', campaign.whatsapp_number_id)
    .eq('name', campaign.template_names[0])
    .single();

  console.log('Template Details:');
  console.log(`  - Name: ${template.name}`);
  console.log(`  - Language: ${template.language}`);
  console.log(`  - Status: ${template.status}`);
  console.log(`  - Category: ${template.category}`);
  console.log(`  - Active: ${template.is_active}`);
  console.log(`  - Quarantined: ${template.is_quarantined}\n`);

  // Check components
  console.log('Template Components:');
  template.components.forEach((comp, idx) => {
    console.log(`  ${idx + 1}. Type: ${comp.type}, Format: ${comp.format || 'N/A'}`);
    if (comp.type === 'HEADER' && comp.format) {
      console.log(`     Media Type: ${comp.format}`);
    }
    if (comp.type === 'BODY' && comp.text) {
      const varCount = (comp.text.match(/\{\{\d+\}\}/g) || []).length;
      console.log(`     Variables: ${varCount}`);
    }
  });
  console.log('');

  // 3. Get sample failed message
  const { data: sampleMessage } = await supabase
    .from('send_queue')
    .select('*')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'failed')
    .limit(1)
    .single();

  console.log('Sample Failed Message:');
  console.log(`  - Phone: ${sampleMessage.phone}`);
  console.log(`  - Error: ${sampleMessage.error_message}`);
  console.log(`  - Retry Count: ${sampleMessage.retry_count}`);
  console.log(`  - Payload:`, JSON.stringify(sampleMessage.payload, null, 2));
  console.log('');

  // 4. Test the template with WhatsApp API
  console.log('🧪 Testing Template with WhatsApp API...\n');

  const phoneNumberId = campaign.whatsapp_numbers.phone_number_id;
  const accessToken = campaign.whatsapp_numbers.access_token;

  // Build the request payload
  const components = [];
  const variables = Object.values(sampleMessage.payload);
  let currentVarIndex = 0;

  // Check for media header
  const headerComponent = template.components.find(c => c.type === 'HEADER');
  const hasMediaHeader = headerComponent &&
    (headerComponent.format === 'VIDEO' || headerComponent.format === 'IMAGE' || headerComponent.format === 'DOCUMENT');

  if (hasMediaHeader && variables.length > 0) {
    const mediaUrl = variables[currentVarIndex];
    currentVarIndex++;

    let mediaType = 'video';
    if (headerComponent.format === 'IMAGE') mediaType = 'image';
    else if (headerComponent.format === 'DOCUMENT') mediaType = 'document';

    components.push({
      type: 'header',
      parameters: [{
        type: mediaType,
        [mediaType]: {
          link: String(mediaUrl)
        }
      }]
    });

    console.log(`Header Component (${mediaType}):`);
    console.log(`  URL: ${mediaUrl}\n`);

    // Test URL accessibility
    try {
      const urlTest = await axios.head(mediaUrl, { timeout: 5000 });
      console.log(`✅ Media URL is accessible (HTTP ${urlTest.status})`);
      console.log(`   Content-Type: ${urlTest.headers['content-type']}`);
      console.log(`   Content-Length: ${urlTest.headers['content-length']} bytes\n`);
    } catch (error) {
      console.log(`❌ Media URL is NOT accessible: ${error.message}\n`);
      console.log('🔍 POSSIBLE CAUSE: WhatsApp cannot access the media URL');
      console.log('   Solutions:');
      console.log('   1. Ensure URL is publicly accessible (no authentication required)');
      console.log('   2. Check if the hosting service blocks WhatsApp\'s IP ranges');
      console.log('   3. Try using a different CDN or hosting service');
      console.log('   4. Verify the URL hasn\'t expired\n');
    }
  }

  // Body variables
  const bodyVariables = variables.slice(currentVarIndex);
  if (bodyVariables.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyVariables.map(value => ({
        type: 'text',
        text: String(value)
      }))
    });

    console.log(`Body Parameters: ${bodyVariables.length} variable(s)`);
    bodyVariables.forEach((v, i) => {
      console.log(`  {{${i + 1}}}: "${v}"`);
    });
    console.log('');
  }

  // Build the API payload
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: sampleMessage.phone,
    type: 'template',
    template: {
      name: template.name,
      language: {
        code: template.language
      },
      components: components.length > 0 ? components : undefined
    }
  };

  console.log('WhatsApp API Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  // Attempt to send test message
  console.log('🚀 Attempting to send test message...\n');
  try {
    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken.trim()}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ SUCCESS! Message sent');
    console.log(`   Message ID: ${response.data.messages[0].id}\n`);
    console.log('🎯 RESOLUTION: The template works! The issue was likely temporary.');
    console.log('   You can safely restart the campaign.');

  } catch (error) {
    console.log('❌ FAILED with error:');
    console.log(JSON.stringify(error.response?.data || error.message, null, 2));
    console.log('');

    const errorCode = error.response?.data?.error?.code;
    const errorMessage = error.response?.data?.error?.message;

    if (errorCode === 135000) {
      console.log('🔍 Error #135000 Analysis:');
      console.log('   This error typically means:');
      console.log('   1. ❌ Media URL format is incorrect or inaccessible to WhatsApp');
      console.log('   2. ❌ Template parameters don\'t match the template definition');
      console.log('   3. ❌ Media file size exceeds WhatsApp limits');
      console.log('   4. ❌ Template status changed or got disabled\n');

      console.log('   Next Steps:');
      console.log('   1. Verify the media URL is publicly accessible');
      console.log('   2. Check video format: MP4, H.264 video codec, AAC audio codec');
      console.log('   3. Check file size: Max 16 MB for videos');
      console.log('   4. Try re-uploading the video to a different CDN');
      console.log('   5. Test with a different video URL\n');
    }
  }

  console.log('📋 Summary:');
  console.log(`   - Total Failed: ${campaign.total_failed}`);
  console.log(`   - Error: ${sampleMessage.error_message}`);
  console.log(`   - Template: ${template.name} (${template.status})`);
}

investigate().catch(console.error);
