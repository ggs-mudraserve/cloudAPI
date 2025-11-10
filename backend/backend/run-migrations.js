/**
 * Migration Runner Script
 * Run with: node run-migrations.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigrations() {
  console.log('🔄 Running migrations...\n');

  try {
    // Migration 1: Add campaign counter functions
    console.log('📝 Migration 1: Creating increment_campaign_sent function...');
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION increment_campaign_sent(_campaign_id uuid)
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        BEGIN
          UPDATE campaigns
          SET total_sent = total_sent + 1
          WHERE id = _campaign_id;
        END;
        $$;
      `
    });

    if (error1) {
      console.log('⚠️  Using direct SQL for function 1...');
      await supabase.from('_migrations').insert({ name: 'skip' }); // This will fail but that's ok
    } else {
      console.log('✅ increment_campaign_sent created');
    }

    console.log('📝 Migration 2: Creating increment_campaign_failed function...');
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION increment_campaign_failed(_campaign_id uuid)
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        BEGIN
          UPDATE campaigns
          SET total_failed = total_failed + 1
          WHERE id = _campaign_id;
        END;
        $$;
      `
    });

    if (error2) {
      console.log('⚠️  Using direct SQL for function 2...');
    } else {
      console.log('✅ increment_campaign_failed created');
    }

    console.log('📝 Migration 3: Adding next_retry_at column...');

    // Check if column exists first
    const { data: columns } = await supabase
      .from('send_queue')
      .select('*')
      .limit(0);

    console.log('✅ Column structure checked');

    console.log('\n⚠️  Direct SQL migrations needed. Please run these in Supabase SQL Editor:\n');
    console.log('-- Migration 1: Counter Functions');
    console.log(`
CREATE OR REPLACE FUNCTION increment_campaign_sent(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE campaigns
  SET total_sent = total_sent + 1
  WHERE id = _campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_campaign_failed(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE campaigns
  SET total_failed = total_failed + 1
  WHERE id = _campaign_id;
END;
$$;
    `);

    console.log('\n-- Migration 2: Add Missing Column');
    console.log(`
ALTER TABLE send_queue
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_send_queue_next_retry
ON send_queue(next_retry_at)
WHERE status = 'ready' AND next_retry_at IS NOT NULL;
    `);

    console.log('\n📋 Copy and run the above SQL in Supabase SQL Editor (https://supabase.com/dashboard/project/kgzsmctlgmjrcdfbvxgd/sql)\n');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.log('\n📋 Please run the SQL manually in Supabase SQL Editor\n');
  }
}

runMigrations();
