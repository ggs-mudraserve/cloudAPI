#!/usr/bin/env node

const { supabase } = require('./src/config/supabase');

const campaignName = process.argv[2] || 'first 50k';

async function deepAnalyze135000Error() {
  try {
    // Find the campaign
    const { data: campaigns, error: campError } = await supabase
      .from('campaigns')
      .select('*')
      .ilike('name', `%${campaignName}%`)
      .limit(1);

    if (campError || !campaigns || campaigns.length === 0) {
      console.error('Campaign not found');
      process.exit(1);
    }

    const campaign = campaigns[0];
    console.log(`\n========================================`);
    console.log(`   DEEP ANALYSIS: Error #135000`);
    console.log(`========================================`);
    console.log(`Campaign: ${campaign.name}`);
    console.log(`Campaign ID: ${campaign.id}\n`);

    // Get failed messages with #135000 error
    const { data: genericErrors, error: queueError } = await supabase
      .from('send_queue')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'failed')
      .ilike('error_message', '%135000%')
      .order('created_at', { ascending: true })
      .limit(100);

    if (queueError) {
      console.error('Error:', queueError.message);
      process.exit(1);
    }

    console.log(`Found ${genericErrors.length} messages with #135000 error (showing first 100)\n`);

    // Analyze timing
    console.log('========================================');
    console.log('   TIMING ANALYSIS');
    console.log('========================================\n');

    const firstError = new Date(genericErrors[0].created_at);
    const lastError = new Date(genericErrors[genericErrors.length - 1].created_at);
    const timeDiff = (lastError - firstError) / 1000; // seconds

    console.log('First #135000 error:', firstError.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('Last #135000 error (in sample):', lastError.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    console.log('Time span:', timeDiff, 'seconds');
    console.log('Errors per second:', (genericErrors.length / timeDiff).toFixed(2), '\n');

    // Analyze full error messages
    console.log('========================================');
    console.log('   FULL ERROR MESSAGE ANALYSIS');
    console.log('========================================\n');

    const uniqueErrors = new Set();
    const errorSamples = [];

    genericErrors.forEach((record, idx) => {
      if (idx < 10) {
        errorSamples.push({
          phone: record.phone,
          error: record.error_message,
          retries: record.retry_count,
          created: new Date(record.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        });
      }
      uniqueErrors.add(record.error_message);
    });

    console.log('Sample errors (first 10):\n');
    errorSamples.forEach((sample, idx) => {
      console.log(`${idx + 1}. Phone: ${sample.phone}`);
      console.log(`   Error: ${sample.error}`);
      console.log(`   Retries: ${sample.retries}`);
      console.log(`   Time: ${sample.created}\n`);
    });

    console.log(`Unique error messages: ${uniqueErrors.size}`);
    console.log('\nAll unique error messages:');
    Array.from(uniqueErrors).forEach((err, idx) => {
      console.log(`${idx + 1}. ${err}`);
    });

    // Check if error message contains more details
    console.log('\n========================================');
    console.log('   LOOKING FOR PATTERNS');
    console.log('========================================\n');

    const patterns = {
      hasPhoneInError: 0,
      hasTemplateInError: 0,
      hasParameterInError: 0,
      hasDetailedMessage: 0,
      isJustCode: 0
    };

    genericErrors.forEach(record => {
      const err = record.error_message.toLowerCase();
      if (err.includes('phone') || err.includes('number')) patterns.hasPhoneInError++;
      if (err.includes('template')) patterns.hasTemplateInError++;
      if (err.includes('parameter') || err.includes('param')) patterns.hasParameterInError++;
      if (err.length > 50) patterns.hasDetailedMessage++;
      if (err.length < 30) patterns.isJustCode++;
    });

    console.log('Error message patterns:');
    console.log('  Mentions phone/number:', patterns.hasPhoneInError);
    console.log('  Mentions template:', patterns.hasTemplateInError);
    console.log('  Mentions parameter:', patterns.hasParameterInError);
    console.log('  Has detailed message (>50 chars):', patterns.hasDetailedMessage);
    console.log('  Just error code (<30 chars):', patterns.isJustCode);

    // Check the template and payload
    console.log('\n========================================');
    console.log('   TEMPLATE & PAYLOAD ANALYSIS');
    console.log('========================================\n');

    const templates = new Set();
    const samplePayloads = [];

    genericErrors.forEach((record, idx) => {
      templates.add(record.template_name);
      if (idx < 5 && record.payload) {
        samplePayloads.push({
          phone: record.phone,
          template: record.template_name,
          payload: record.payload
        });
      }
    });

    console.log('Templates used in failed messages:', Array.from(templates).join(', '));
    console.log('\nSample payloads (first 5):\n');
    samplePayloads.forEach((sample, idx) => {
      console.log(`${idx + 1}. Phone: ${sample.phone}`);
      console.log(`   Template: ${sample.template}`);
      console.log(`   Payload: ${JSON.stringify(sample.payload, null, 2)}\n`);
    });

    // Check WhatsApp number configuration
    console.log('========================================');
    console.log('   WHATSAPP NUMBER CONFIGURATION');
    console.log('========================================\n');

    const { data: whatsappNum, error: numError } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('id', campaign.whatsapp_number_id)
      .single();

    if (!numError && whatsappNum) {
      console.log('Display Name:', whatsappNum.display_name);
      console.log('Phone Number ID:', whatsappNum.phone_number_id);
      console.log('Is Active:', whatsappNum.is_active);
      console.log('Max Send Rate:', whatsappNum.max_send_rate_per_sec, 'msg/sec');
      console.log('Last Stable Rate:', whatsappNum.last_stable_rate_per_sec, 'msg/sec');
    }

    // Get campaign timeline
    console.log('\n========================================');
    console.log('   CAMPAIGN TIMELINE');
    console.log('========================================\n');

    const { data: allQueue, error: allQueueError } = await supabase
      .from('send_queue')
      .select('status, created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true });

    if (!allQueueError && allQueue) {
      const statusByMinute = {};
      allQueue.forEach(record => {
        const minute = new Date(record.created_at).toISOString().substring(0, 16); // YYYY-MM-DDTHH:MM
        if (!statusByMinute[minute]) {
          statusByMinute[minute] = { sent: 0, failed: 0, total: 0 };
        }
        statusByMinute[minute].total++;
        if (record.status === 'sent') statusByMinute[minute].sent++;
        if (record.status === 'failed') statusByMinute[minute].failed++;
      });

      console.log('Message status by minute (first 10 minutes):');
      Object.keys(statusByMinute).slice(0, 10).forEach(minute => {
        const stats = statusByMinute[minute];
        const failRate = ((stats.failed / stats.total) * 100).toFixed(1);
        console.log(`${minute}: Total=${stats.total}, Sent=${stats.sent}, Failed=${stats.failed} (${failRate}%)`);
      });
    }

    console.log('\n========================================');
    console.log('   HYPOTHESIS');
    console.log('========================================\n');

    console.log('Based on the analysis, #135000 "Generic user error" could mean:\n');
    console.log('1. TEMPLATE ISSUES:');
    console.log('   - Template variables not matching payload');
    console.log('   - Template was rejected/not approved');
    console.log('   - Template format issues\n');

    console.log('2. PAYLOAD ISSUES:');
    console.log('   - Missing required parameters');
    console.log('   - Invalid parameter format');
    console.log('   - Empty or malformed variables\n');

    console.log('3. RATE LIMITING (masked as generic error):');
    console.log('   - Too many messages at once');
    console.log('   - WhatsApp API rejecting requests\n');

    console.log('4. ACCOUNT/PHONE NUMBER ISSUES:');
    console.log('   - Business phone number has restrictions');
    console.log('   - Template quality rating low');
    console.log('   - Account in limited state\n');

    console.log('RECOMMENDATION:');
    console.log('Check the actual error response from WhatsApp API in the logs.');
    console.log('The #135000 might be a catch-all error from WhatsApp.\n');

    console.log('========================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

deepAnalyze135000Error();
