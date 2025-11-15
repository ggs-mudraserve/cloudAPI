#!/usr/bin/env node

/**
 * ⚠️ OBSOLETE SCRIPT - DO NOT USE ⚠️
 * This script was used for cloud Supabase migration.
 * We now use LOCAL self-hosted Supabase at http://localhost:8000
 *
 * Kept for historical reference only.
 * Last used: November 2025
 *
 * Apply use_template_media migration using direct query
 */

console.error('⚠️ OBSOLETE SCRIPT - This script is for cloud Supabase only.');
console.error('We now use LOCAL Supabase. Exiting...');
process.exit(1);

const { Pool } = require('pg');
require('dotenv').config();

// OLD CLOUD SUPABASE - DO NOT USE
// Extract connection details from SUPABASE_URL
// Format: https://facxofxojjfqvpxmyavl.supabase.co
const projectRef = 'facxofxojjfqvpxmyavl';
const password = 'Hk@2580063690';

const pool = new Pool({
  host: `aws-0-ap-south-1.pooler.supabase.com`,
  port: 6543,
  database: 'postgres',
  user: `postgres.${projectRef}`,
  password: password,
  ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
  console.log('📝 Applying use_template_media migration...\n');

  const client = await pool.connect();

  try {
    // Execute the migration SQL
    await client.query(`
      ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS use_template_media BOOLEAN DEFAULT false;
    `);

    await client.query(`
      COMMENT ON COLUMN campaigns.use_template_media IS 'When true, uses the template''s approved WhatsApp CDN media URL instead of CSV-provided media';
    `);

    console.log('✅ Migration applied successfully!');
    console.log('   - Added use_template_media column to campaigns table');
    console.log('   - Default value: false');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
