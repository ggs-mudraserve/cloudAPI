const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  host: 'aws-0-ap-south-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.facxofxojjfqvpxmyavl',
  password: 'Hk@2580063690',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();

  try {
    const sql = fs.readFileSync('/root/cloudAPI/migrations/009_add_campaign_performance_functions.sql', 'utf8');

    console.log('Applying performance migration...');

    await client.query(sql);

    console.log('✓ Migration applied successfully');

    // Test the function
    console.log('\nTesting function with campaign dcbd53d7-e023-4fdf-aef6-84b975e2fb97...');
    const result = await client.query(
      'SELECT * FROM get_campaign_contact_distribution($1)',
      ['dcbd53d7-e023-4fdf-aef6-84b975e2fb97']
    );

    console.log('Test result:');
    console.log(JSON.stringify(result.rows, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
