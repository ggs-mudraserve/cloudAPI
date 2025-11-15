#!/usr/bin/env node

const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

const campaignName = process.argv[2] || 'first 50k';

async function exportFailedNumbers() {
  try {
    // Find the campaign
    const { data: campaigns, error: campError } = await supabase
      .from('campaigns')
      .select('id, name')
      .ilike('name', `%${campaignName}%`)
      .limit(1);

    if (campError || !campaigns || campaigns.length === 0) {
      console.error('Campaign not found');
      process.exit(1);
    }

    const campaign = campaigns[0];
    console.log(`\nExporting failed numbers for campaign: ${campaign.name}`);
    console.log(`Campaign ID: ${campaign.id}\n`);

    // Get all failed messages from send_queue
    const { data: failedQueue, error: queueError } = await supabase
      .from('send_queue')
      .select('phone, error_message, retry_count, created_at, updated_at')
      .eq('campaign_id', campaign.id)
      .eq('status', 'failed')
      .order('phone', { ascending: true });

    if (queueError) {
      console.error('Error fetching failed queue:', queueError.message);
      process.exit(1);
    }

    console.log(`Found ${failedQueue.length} failed numbers\n`);

    // Categorize by error type
    const genericErrors = [];
    const rateLimitErrors = [];
    const otherErrors = [];

    failedQueue.forEach(record => {
      const phone = record.phone;
      const error = record.error_message || 'Unknown error';
      const errorType = error.includes('#135000') ? 'Generic User Error' :
                       error.includes('#130429') ? 'Rate Limit' :
                       'Other';

      const entry = {
        phone,
        error: error.substring(0, 100),
        errorType,
        retryCount: record.retry_count || 0,
        firstAttempt: new Date(record.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        lastAttempt: new Date(record.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };

      if (errorType === 'Generic User Error') {
        genericErrors.push(entry);
      } else if (errorType === 'Rate Limit') {
        rateLimitErrors.push(entry);
      } else {
        otherErrors.push(entry);
      }
    });

    // Create exports directory if it doesn't exist
    const exportDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];

    // Export 1: CSV with all failed numbers
    const allCsvPath = path.join(exportDir, `failed_numbers_all_${timestamp}.csv`);
    const allCsvContent = [
      'Phone,Error Type,Error Message,Retry Count,First Attempt,Last Attempt',
      ...failedQueue.map(record => {
        const phone = record.phone;
        const error = (record.error_message || 'Unknown').replace(/,/g, ';').replace(/\n/g, ' ');
        const errorType = error.includes('#135000') ? 'Generic User Error' :
                         error.includes('#130429') ? 'Rate Limit' : 'Other';
        return `${phone},${errorType},"${error}",${record.retry_count || 0},${new Date(record.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })},${new Date(record.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
      })
    ].join('\n');
    fs.writeFileSync(allCsvPath, allCsvContent);

    // Export 2: Simple text file with just phone numbers (Generic User Error)
    const genericPhonePath = path.join(exportDir, `failed_numbers_generic_error_${timestamp}.txt`);
    const genericPhoneContent = genericErrors.map(e => e.phone).join('\n');
    fs.writeFileSync(genericPhonePath, genericPhoneContent);

    // Export 3: Simple text file with just phone numbers (Rate Limit)
    const rateLimitPhonePath = path.join(exportDir, `failed_numbers_rate_limit_${timestamp}.txt`);
    const rateLimitPhoneContent = rateLimitErrors.map(e => e.phone).join('\n');
    fs.writeFileSync(rateLimitPhonePath, rateLimitPhoneContent);

    // Export 4: Detailed CSV for Generic User Error (for manual verification)
    const genericCsvPath = path.join(exportDir, `failed_numbers_to_verify_${timestamp}.csv`);
    const genericCsvContent = [
      'Phone Number,Error,Retry Count,Status to Check,Notes',
      ...genericErrors.map(e => `${e.phone},"${e.error}",${e.retryCount},Not Checked,`)
    ].join('\n');
    fs.writeFileSync(genericCsvPath, genericCsvContent);

    // Export 5: Summary JSON
    const summaryPath = path.join(exportDir, `failed_numbers_summary_${timestamp}.json`);
    const summary = {
      campaign: {
        name: campaign.name,
        id: campaign.id
      },
      exportDate: new Date().toISOString(),
      total: failedQueue.length,
      breakdown: {
        genericUserError: genericErrors.length,
        rateLimit: rateLimitErrors.length,
        other: otherErrors.length
      },
      files: {
        allFailedCsv: path.basename(allCsvPath),
        genericErrorPhones: path.basename(genericPhonePath),
        rateLimitPhones: path.basename(rateLimitPhonePath),
        verificationCsv: path.basename(genericCsvPath),
        summary: path.basename(summaryPath)
      },
      recommendations: {
        genericUserError: 'These numbers likely do not exist on WhatsApp or have blocked your business. Verify manually and remove from contact list.',
        rateLimit: 'These are valid numbers but failed due to rate limiting. Can be retried in a new campaign with slower send rate.',
        action: 'Focus on verifying the Generic User Error numbers (' + genericErrors.length + ' total) as these are most likely invalid.'
      }
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log('========================================');
    console.log('   EXPORT COMPLETE');
    console.log('========================================\n');

    console.log('Files created in: ' + exportDir + '\n');

    console.log('1. ALL FAILED NUMBERS (CSV with details):');
    console.log('   ' + path.basename(allCsvPath));
    console.log('   Total: ' + failedQueue.length + ' numbers\n');

    console.log('2. GENERIC USER ERROR NUMBERS (Text file - one per line):');
    console.log('   ' + path.basename(genericPhonePath));
    console.log('   Total: ' + genericErrors.length + ' numbers');
    console.log('   → Use this to verify on WhatsApp manually\n');

    console.log('3. RATE LIMIT NUMBERS (Text file - one per line):');
    console.log('   ' + path.basename(rateLimitPhonePath));
    console.log('   Total: ' + rateLimitErrors.length + ' numbers');
    console.log('   → These are likely valid, failed due to rate limits\n');

    console.log('4. VERIFICATION CHECKLIST (CSV):');
    console.log('   ' + path.basename(genericCsvPath));
    console.log('   Total: ' + genericErrors.length + ' numbers');
    console.log('   → Use this to track your manual verification progress\n');

    console.log('5. SUMMARY (JSON):');
    console.log('   ' + path.basename(summaryPath));
    console.log('   → Campaign summary and export metadata\n');

    console.log('========================================');
    console.log('   BREAKDOWN');
    console.log('========================================\n');
    console.log(`Generic User Error (#135000): ${genericErrors.length} numbers (83.44%)`);
    console.log(`  → Priority: HIGH - Verify these on WhatsApp\n`);
    console.log(`Rate Limit (#130429): ${rateLimitErrors.length} numbers (16.56%)`);
    console.log(`  → Priority: LOW - These are likely valid\n`);
    console.log(`Other Errors: ${otherErrors.length} numbers\n`);

    console.log('========================================');
    console.log('   NEXT STEPS');
    console.log('========================================\n');
    console.log('1. Download the file: ' + genericPhonePath);
    console.log('2. Use a bulk WhatsApp checker tool or manually verify');
    console.log('3. Update the verification CSV with results');
    console.log('4. Remove invalid numbers from your contact database\n');

    console.log('Full export path:');
    console.log(exportDir + '\n');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

exportFailedNumbers();
