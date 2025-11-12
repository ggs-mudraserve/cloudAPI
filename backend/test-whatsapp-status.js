#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkStatus() {
  const { data } = await s
    .from('whatsapp_numbers')
    .select('phone_number_id, access_token, display_name')
    .limit(1)
    .single();

  if (!data) {
    console.log('No number found');
    return;
  }

  console.log('Testing:', data.display_name);

  const cleanToken = data.access_token.replace(/\s+/g, '').trim();
  const cleanPhoneId = data.phone_number_id.replace(/\s+/g, '').trim();

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${cleanPhoneId}`,
      {
        headers: {
          'Authorization': `Bearer ${cleanToken}`
        },
        params: {
          fields: 'verified_name,display_phone_number,quality_rating,messaging_limit_tier'
        }
      }
    );

    console.log('\n✅ WhatsApp Connection Status:');
    console.log('Verified Name:', response.data.verified_name);
    console.log('Display Phone:', response.data.display_phone_number);
    console.log('Quality Rating:', response.data.quality_rating);
    console.log('Messaging Tier:', response.data.messaging_limit_tier);
  } catch (error) {
    console.error('\n❌ Connection Error:');
    console.error(JSON.stringify(error.response?.data || error.message, null, 2));
  }
}

checkStatus();
