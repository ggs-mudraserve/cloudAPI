const { createClient } = require('@supabase/supabase-js');

async function addMediaUrlColumn() {
  try {
    // Get credentials from environment
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Adding media_url column to messages table...');

    // Try to insert a test record to check if column exists
    const { error: checkError } = await supabase
      .from('messages')
      .select('media_url')
      .limit(1);

    if (checkError && checkError.code === '42703') {
      console.log('Column does not exist, needs to be added via SQL...');
      console.log('Please run this SQL in your Supabase SQL Editor:');
      console.log('ALTER TABLE messages ADD COLUMN media_url text;');
    } else if (!checkError) {
      console.log('✅ media_url column already exists');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addMediaUrlColumn();
