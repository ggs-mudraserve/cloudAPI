#!/usr/bin/env node

const {createClient} = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function findLatest() {
  const { data: campaign } = await s
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!campaign) {
    console.log('No campaign found');
    return;
  }

  console.log('📊 Latest Campaign:', campaign.name);
  console.log('ID:', campaign.id);
  console.log('Status:', campaign.status);
  console.log('use_template_media:', campaign.use_template_media);
  console.log('Total:', campaign.total_contacts);
  console.log('Sent:', campaign.total_sent);
  console.log('Failed:', campaign.total_failed);
  console.log('Created:', campaign.created_at);

  const { data: queue } = await s
    .from('send_queue')
    .select('status')
    .eq('campaign_id', campaign.id);

  const stats = {};
  (queue || []).forEach(m => {
    stats[m.status] = (stats[m.status] || 0) + 1;
  });

  console.log('\n📦 Queue:', JSON.stringify(stats));

  const { data: sample } = await s
    .from('send_queue')
    .select('payload, status')
    .eq('campaign_id', campaign.id)
    .limit(2);

  if (sample && sample.length > 0) {
    console.log('\n📄 Sample Payloads:');
    sample.forEach((m, i) => {
      console.log(`${i+1}. Status: ${m.status}`);
      console.log('   Payload:', JSON.stringify(m.payload));
    });
  }
}

findLatest();
