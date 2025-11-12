#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkHistory() {
  const { data: templates, error } = await s
    .from('templates')
    .select('name, status, category, is_active, is_quarantined, created_at, updated_at')
    .in('name', ['10_nov_2025_temp1', '10_nov_2025_temp_bajaj1'])
    .order('name');

  if (error) {
    console.log('Error:', error);
    return;
  }

  if (!templates || templates.length === 0) {
    console.log('No templates found');
    return;
  }

  for (const t of templates) {
    console.log('===================');
    console.log('Name:', t.name);
    console.log('Status:', t.status);
    console.log('Category:', t.category);
    console.log('Active:', t.is_active);
    console.log('Quarantined:', t.is_quarantined);
    console.log('Created:', t.created_at);
    console.log('Updated:', t.updated_at);
    console.log('');
  }

  // Check if bajaj1 was recently synced
  const { data: syncLog } = await s
    .from('template_sync_log')
    .select('*')
    .order('synced_at', { ascending: false })
    .limit(5);

  if (syncLog && syncLog.length > 0) {
    console.log('\n=== Recent Template Syncs ===');
    for (const log of syncLog) {
      console.log(log.synced_at, '| Templates synced:', log.templates_synced);
    }
  }
}

checkHistory();
