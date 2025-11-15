const axios = require('axios');

async function runSQL() {
  try {
    const supabaseUrl = 'http://localhost:8000';
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTYzOTk2MTIsImV4cCI6MjA3MTc1OTYxMn0.8vwMwbB_VU6Qsul07ev7cfeAHI1qsFIBUJ_x5bds3tU';

    console.log('Executing SQL to add media_url column...');

    // Use Supabase REST API to execute SQL via a function or direct query
    // For self-hosted, we can use the /rest/v1/rpc endpoint if we have a function
    // Or we can use pg library directly

    const { Client } = require('pg');

    const client = new Client({
      host: 'localhost',
      port: 5432, // PostgreSQL port
      database: 'postgres',
      user: 'postgres',
      password: 'postgres', // Default self-hosted password
    });

    await client.connect();

    const result = await client.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url text;');

    console.log('✅ Successfully added media_url column!');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

runSQL();
