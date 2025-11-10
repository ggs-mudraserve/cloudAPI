const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with service key for backend operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

// Test connection on startup
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .select('count')
      .limit(1);

    if (error) throw error;
    console.log('✅ Supabase connection established');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to Supabase:', error.message);
    return false;
  }
}

module.exports = { supabase, testConnection };
