#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testNoHeader() {
  const { data } = await s
    .from('whatsapp_numbers')
    .select('phone_number_id, access_token, display_name')
    .eq('phone_number_id', '875062729021816')
    .single();

  if (!data) {
    console.log('WhatsApp number not found');
    return;
  }

  console.log('Using WhatsApp number:', data.display_name);

  // Try WITHOUT header component
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '919876543210',
    type: 'template',
    template: {
      name: '10_nov_2025_temp_bajaj1',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Test User' },
            { type: 'text', text: 'Testing Status' }
          ]
        }
      ]
    }
  };

  console.log('\nSending WITHOUT header (no media)...');
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${data.phone_number_id}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${data.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ SUCCESS!');
    console.log('Message ID:', response.data.messages[0].id);
  } catch (error) {
    console.error('\n❌ FAILED!');
    console.error('Error:', JSON.stringify(error.response?.data || error.message, null, 2));
  }
}

testNoHeader();
