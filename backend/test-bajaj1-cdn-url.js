#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testBajaj1CDN() {
  // Get the CORRECT WhatsApp number for this template
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

  // Use the TEMPLATE'S approved CDN URL
  const cdnUrl = 'https://scontent.whatsapp.net/v/t61.29466-34/546242654_2338122079965638_4231095002262918514_n.mp4?ccb=1-7&_nc_sid=8b1bef&_nc_ohc=1dhLblicNLUQ7kNvwEtMIzq&_nc_oc=Adnx8g95_WHJcEn_IiuI4omx8NNug5KnyHDQNOAlKdnYIuYk1qLqIe4yR3rbDFUfTx3Ze0DAWG5IAPvtlQOTc5Xn&_nc_zt=28&_nc_ht=scontent.whatsapp.net&edm=AH51TzQEAAAA&_nc_gid=JxKZjatH7AGZNKj3qBrZng&_nc_tpa=Q5bMBQEBhkLdAZCEno2fwu6VyHBrkz2yJJIVni_bl-E4dTlBr8FovKHpbCfdwjXiwBQnz9dB2YbZbShIYA&oh=01_Q5Aa3AEZyLgfaz4_kU-JmTnBCpK76fE5KOq7KdnIRr82GZtKuQ&oe=69398EDF';

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
          type: 'header',
          parameters: [{
            type: 'video',
            video: {
              link: cdnUrl
            }
          }]
        },
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

  console.log('\nSending with template CDN URL...');

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

    console.log('✅ SUCCESS!');
    console.log('Message ID:', response.data.messages[0].id);
  } catch (error) {
    console.error('❌ FAILED!');
    console.error('Error:', JSON.stringify(error.response?.data || error.message, null, 2));
  }
}

testBajaj1CDN();
