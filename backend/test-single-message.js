#!/usr/bin/env node

/**
 * Test sending a single message with the S3 URL to get detailed error
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testSingleMessage() {
  console.log('🧪 Testing Single Message with S3 URL\n');

  // Get WhatsApp number details
  const { data: whatsappNumber } = await supabase
    .from('whatsapp_numbers')
    .select('*')
    .eq('id', 'd07855e2-ce19-425f-af8b-8e72993e5af5')
    .single();

  // Get template
  const { data: template } = await supabase
    .from('templates')
    .select('*')
    .eq('name', '10_nov_2025_temp_bajaj1')
    .single();

  console.log('WhatsApp Number:', whatsappNumber.display_name);
  console.log('Template:', template.name);
  console.log('');

  // Build payload EXACTLY as the code does
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '919876543210', // Test number
    type: 'template',
    template: {
      name: template.name,
      language: {
        code: template.language
      },
      components: [
        {
          type: 'header',
          parameters: [{
            type: 'video',
            video: {
              link: 'https://botspace-uploads.s3.eu-west-1.amazonaws.com/67568b9a6ef2fcdf13332d26/uploads/1a40c955-5883-4ec6-8f6f-5d604126d4ff.mp4'
            }
          }]
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Test Name' },
            { type: 'text', text: 'Test Status' }
          ]
        }
      ]
    }
  };

  console.log('Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${whatsappNumber.phone_number_id}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${whatsappNumber.access_token.trim()}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ SUCCESS!');
    console.log('Message ID:', response.data.messages[0].id);

  } catch (error) {
    console.log('❌ FAILED');
    console.log('Error:', JSON.stringify(error.response?.data || error.message, null, 2));

    if (error.response?.data?.error?.error_user_title) {
      console.log('\nUser Title:', error.response.data.error.error_user_title);
    }
    if (error.response?.data?.error?.error_user_msg) {
      console.log('User Message:', error.response.data.error.error_user_msg);
    }
  }
}

testSingleMessage().catch(console.error);
