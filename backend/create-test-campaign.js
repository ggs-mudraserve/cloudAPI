const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const supabase = createClient('http://localhost:8000', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTYzOTk2MTIsImV4cCI6MjA3MTc1OTYxMn0.8vwMwbB_VU6Qsul07ev7cfeAHI1qsFIBUJ_x5bds3tU');

(async () => {
  try {
    console.log('Creating test campaign...');

    // Read CSV
    const csvContent = fs.readFileSync('/tmp/test-single-contact.csv', 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`Parsed ${records.length} contacts from CSV`);

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: 'Test Single Send - 919555555611',
        whatsapp_number_id: '141681c8-e32b-452b-8b1c-fa16b9e65b47',
        template_names: ['12_nov_2025_temp6'],
        total_contacts: records.length,
        status: 'running',
        start_time: new Date().toISOString(),
        use_template_media: false,
        current_template_index: 0
      })
      .select()
      .single();

    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      process.exit(1);
    }

    console.log('Campaign created:', campaign.id);

    // Create campaign contacts
    const campaignContacts = records.map(record => ({
      campaign_id: campaign.id,
      phone: record.Phone,
      variables: {
        var1: record.var1,
        var2: record.var2,
        var3: record.var3
      }
    }));

    const { error: contactsError } = await supabase
      .from('campaign_contacts')
      .insert(campaignContacts);

    if (contactsError) {
      console.error('Error creating contacts:', contactsError);
      process.exit(1);
    }

    console.log('Campaign contacts created');

    // Create send queue entries
    const queueEntries = records.map((record, index) => ({
      campaign_id: campaign.id,
      whatsapp_number_id: '141681c8-e32b-452b-8b1c-fa16b9e65b47',
      template_name: '12_nov_2025_temp6',
      phone: record.Phone,
      payload: {
        var1: record.var1,
        var2: record.var2,
        var3: record.var3
      },
      status: 'ready',
      template_order: 0
    }));

    const { error: queueError } = await supabase
      .from('send_queue')
      .insert(queueEntries);

    if (queueError) {
      console.error('Error creating queue entries:', queueError);
      process.exit(1);
    }

    console.log('Send queue entries created');
    console.log('\n✅ Test campaign created successfully!');
    console.log('Campaign ID:', campaign.id);
    console.log('Status: running');
    console.log('\nThe campaign should start processing automatically.');
    console.log('Monitor with: pm2 logs whatsapp-app --lines 100');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
