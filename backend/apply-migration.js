#!/usr/bin/env node

/**
 * Apply use_template_media migration
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function applyMigration() {
  console.log('📝 Applying use_template_media migration...\n');

  try {
    // Execute the migration SQL
    const { data, error } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE campaigns
        ADD COLUMN IF NOT EXISTS use_template_media BOOLEAN DEFAULT false;

        COMMENT ON COLUMN campaigns.use_template_media IS 'When true, uses the template''s approved WhatsApp CDN media URL instead of CSV-provided media';
      `
    });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }

    console.log('✅ Migration applied successfully!');
    console.log('   - Added use_template_media column to campaigns table');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

applyMigration();
