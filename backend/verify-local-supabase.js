#!/usr/bin/env node
/**
 * Verify Local Supabase Connection
 * This script verifies that the application is correctly connected to local Supabase
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const EXPECTED_LOCAL_URL = 'http://localhost:8000';
const EXPECTED_LOCAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTYzOTk2MTIsImV4cCI6MjA3MTc1OTYxMn0.8vwMwbB_VU6Qsul07ev7cfeAHI1qsFIBUJ_x5bds3tU';

console.log('🔍 Verifying Supabase Configuration\n');

// Check environment variables
console.log('1. Environment Variables:');
console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL}`);
console.log(`   SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? '***' + process.env.SUPABASE_SERVICE_KEY.slice(-10) : 'NOT SET'}`);
console.log('');

// Verify configuration
let configOk = true;

if (process.env.SUPABASE_URL === EXPECTED_LOCAL_URL) {
  console.log('   ✅ SUPABASE_URL is correctly set to LOCAL Supabase');
} else {
  console.log(`   ❌ SUPABASE_URL is NOT pointing to local Supabase!`);
  console.log(`      Expected: ${EXPECTED_LOCAL_URL}`);
  console.log(`      Found: ${process.env.SUPABASE_URL}`);
  configOk = false;
}

if (process.env.SUPABASE_SERVICE_KEY === EXPECTED_LOCAL_KEY) {
  console.log('   ✅ SUPABASE_SERVICE_KEY matches local Supabase key');
} else {
  console.log('   ⚠️  SUPABASE_SERVICE_KEY does not match expected local key');
}

console.log('');

if (!configOk) {
  console.log('❌ Configuration check FAILED!');
  console.log('');
  console.log('To fix, run:');
  console.log('  bash /root/cloudAPI/fix-supabase-config.sh');
  console.log('');
  process.exit(1);
}

// Test database connection
console.log('2. Testing Database Connection...');

async function testConnection() {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });

    // Try to query a table
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .select('id, display_name, is_active')
      .limit(5);

    if (error) {
      console.log(`   ❌ Database query failed: ${error.message}`);
      console.log(`   Error details:`, error);
      process.exit(1);
    }

    console.log(`   ✅ Successfully connected to database`);
    console.log(`   📊 Found ${data.length} WhatsApp number(s) configured`);

    if (data.length > 0) {
      console.log('');
      console.log('   WhatsApp Numbers:');
      data.forEach((num, idx) => {
        console.log(`   ${idx + 1}. ${num.display_name} (${num.is_active ? 'Active' : 'Inactive'})`);
      });
    }

    console.log('');
    console.log('✅ All checks passed! Application is correctly using LOCAL Supabase.');
    console.log('📍 Location: http://localhost:8000');
    console.log('');

    process.exit(0);

  } catch (err) {
    console.log(`   ❌ Connection test failed: ${err.message}`);
    console.log('');
    console.log('Possible issues:');
    console.log('  1. Local Supabase Docker containers not running');
    console.log('  2. Port 8000 not accessible');
    console.log('');
    console.log('To check Docker containers:');
    console.log('  docker ps | grep supabase');
    console.log('');
    process.exit(1);
  }
}

testConnection();
