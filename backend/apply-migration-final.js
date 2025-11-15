#!/usr/bin/env node

/**
 * ⚠️ OBSOLETE SCRIPT - DO NOT USE ⚠️
 * This script was used for cloud Supabase migration.
 * We now use LOCAL self-hosted Supabase at http://localhost:8000
 *
 * Kept for historical reference only.
 * Last used: November 2025
 *
 * Apply use_template_media migration using connection string
 */

console.error('⚠️ OBSOLETE SCRIPT - This script is for cloud Supabase only.');
console.error('We now use LOCAL Supabase. Exiting...');
process.exit(1);

const { Pool } = require('pg');
require('dotenv').config();

// OLD CLOUD SUPABASE - DO NOT USE
const connectionString = 'postgresql://postgres.facxofxojjfqvpxmyavl:Hk@2580063690@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString,
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

    console.log('   ✓ Added use_template_media column');

    await client.query(`
      COMMENT ON COLUMN campaigns.use_template_media IS 'When true, uses the template''s approved WhatsApp CDN media URL instead of CSV-provided media';
    `);

    console.log('   ✓ Added column comment');

    console.log('\n✅ Migration applied successfully!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
