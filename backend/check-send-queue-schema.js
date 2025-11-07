/**
 * Check send_queue Table Schema
 * Verifies all required columns exist
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Required columns based on queueProcessor.js and campaignService.js
const REQUIRED_COLUMNS = [
  'id',                      // UUID primary key
  'campaign_id',             // UUID foreign key
  'whatsapp_number_id',      // UUID foreign key
  'template_name',           // text
  'phone',                   // text
  'payload',                 // jsonb (template variables)
  'status',                  // text (ready, processing, sent, failed)
  'retry_count',             // integer (default 0)
  'error_message',           // text (nullable)
  'next_retry_at',           // timestamptz (nullable)
  'sent_at',                 // timestamptz (nullable)
  'whatsapp_message_id',     // text (nullable)
  'created_at'               // timestamptz (default now())
];

async function checkSchema() {
  try {
    console.log('🔍 Checking send_queue table schema...\n');

    // Query information_schema to get column details
    const { data: columns, error } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'send_queue'
          ORDER BY ordinal_position;
        `
      });

    if (error) {
      // Fallback: try to query the table directly to see what columns exist
      console.log('⚠️  Cannot query information_schema, trying direct table query...\n');

      const { data: sample, error: sampleError } = await supabase
        .from('send_queue')
        .select('*')
        .limit(1)
        .single();

      if (sampleError && sampleError.code !== 'PGRST116') {
        console.error('❌ Error querying send_queue:', sampleError);
        return;
      }

      const existingColumns = sample ? Object.keys(sample) : [];

      console.log('📋 Existing Columns:');
      existingColumns.forEach(col => console.log(`  ✅ ${col}`));
      console.log();

      console.log('📋 Required Columns:');
      const missing = [];
      REQUIRED_COLUMNS.forEach(col => {
        if (existingColumns.includes(col)) {
          console.log(`  ✅ ${col}`);
        } else {
          console.log(`  ❌ ${col} - MISSING!`);
          missing.push(col);
        }
      });
      console.log();

      if (missing.length > 0) {
        console.log('❌ Missing columns found!\n');
        console.log('Run this SQL in Supabase SQL Editor:\n');
        console.log(generateMigrationSQL(missing));
      } else {
        console.log('✅ All required columns exist!\n');
      }

      return;
    }

    // If we have column info from information_schema
    console.log('📋 Current Table Schema:');
    console.log('─'.repeat(80));
    columns.forEach(col => {
      console.log(`${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('─'.repeat(80));
    console.log();

    // Check for missing columns
    const existingColumns = columns.map(c => c.column_name);
    const missing = REQUIRED_COLUMNS.filter(col => !existingColumns.includes(col));

    if (missing.length > 0) {
      console.log('❌ Missing columns found!');
      missing.forEach(col => console.log(`  - ${col}`));
      console.log();
      console.log('Run this SQL in Supabase SQL Editor:\n');
      console.log(generateMigrationSQL(missing));
    } else {
      console.log('✅ All required columns exist!\n');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

function generateMigrationSQL(missingColumns) {
  const alterStatements = [];

  missingColumns.forEach(col => {
    let sql = '';
    switch (col) {
      case 'retry_count':
        sql = `ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0 NOT NULL`;
        break;
      case 'error_message':
        sql = `ADD COLUMN IF NOT EXISTS error_message text`;
        break;
      case 'next_retry_at':
        sql = `ADD COLUMN IF NOT EXISTS next_retry_at timestamptz`;
        break;
      case 'sent_at':
        sql = `ADD COLUMN IF NOT EXISTS sent_at timestamptz`;
        break;
      case 'whatsapp_message_id':
        sql = `ADD COLUMN IF NOT EXISTS whatsapp_message_id text`;
        break;
      default:
        sql = `ADD COLUMN IF NOT EXISTS ${col} text`;
    }
    alterStatements.push(sql);
  });

  return `-- Add missing columns to send_queue
ALTER TABLE send_queue
${alterStatements.join(',\n')};

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_send_queue_next_retry
ON send_queue(next_retry_at)
WHERE status = 'ready' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_send_queue_sent_at
ON send_queue(sent_at)
WHERE sent_at IS NOT NULL;
`;
}

checkSchema();
