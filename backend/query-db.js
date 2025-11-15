#!/usr/bin/env node
/**
 * Database Query Helper Script
 * This script provides a safe way to query the LOCAL self-hosted Supabase database
 *
 * Usage:
 *   node query-db.js "SELECT * FROM campaigns LIMIT 5"
 *   node query-db.js campaigns "id, name, status"
 */

const { supabase } = require('./src/config/supabase');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node query-db.js <table> [columns]');
    console.log('');
    console.log('Examples:');
    console.log('  node query-db.js campaigns');
    console.log('  node query-db.js campaigns "id, name, status"');
    console.log('  node query-db.js send_queue "status" --campaign-id=<id>');
    console.log('');
    process.exit(1);
  }

  const table = args[0];
  const columns = args[1] || '*';

  console.log(`\n🔍 Querying local Supabase: ${table}\n`);

  try {
    let query = supabase.from(table).select(columns);

    // Check for campaign-id filter
    const campaignIdArg = args.find(arg => arg.startsWith('--campaign-id='));
    if (campaignIdArg) {
      const campaignId = campaignIdArg.split('=')[1];
      query = query.eq('campaign_id', campaignId);
      console.log(`📌 Filtering by campaign_id: ${campaignId}\n`);
    }

    // Limit results
    query = query.limit(10);

    const { data, error } = await query;

    if (error) {
      console.error('❌ Query failed:', error.message);
      console.error('Details:', error);
      process.exit(1);
    }

    console.log(`✅ Found ${data.length} result(s):\n`);
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
