#!/usr/bin/env node

/**
 * Webhook Test Script
 *
 * This script monitors the backend logs to verify webhook events are being received
 * Run this after configuring the webhook in Meta Business Manager
 *
 * Usage: node test-webhook.js
 */

console.log('🔍 Webhook Test Monitor');
console.log('========================\n');

console.log('✅ Webhook Configuration:');
console.log('   URL: https://dd322f6aa1f9.ngrok-free.app/api/webhooks');
console.log('   Verify Token: 456989ee095e900b302baee56b44f7578c3903aa7008adcdf5e8dd4263b62ebb\n');

console.log('📋 Next Steps:');
console.log('   1. Go to Meta Business Manager → Webhooks');
console.log('   2. Click "Verify and save"');
console.log('   3. Subscribe to "messages" field');
console.log('   4. Send a test WhatsApp message from your phone\n');

console.log('🎯 Expected Webhook Events:');
console.log('   - Message Status: sent, delivered, read');
console.log('   - Incoming Messages: When user replies\n');

console.log('📊 To monitor webhooks in real-time:');
console.log('   - Watch ngrok dashboard: http://127.0.0.1:4040');
console.log('   - Check backend logs for: "Webhook received"');
console.log('   - Query database: message_status_logs table\n');

// Test database connection
const { supabase } = require('./backend/src/config/supabase');

async function checkRecentWebhookData() {
  console.log('🔎 Checking for recent webhook data...\n');

  // Check message_status_logs
  const { data: statusLogs, error: statusError } = await supabase
    .from('message_status_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (statusError) {
    console.error('❌ Error querying message_status_logs:', statusError.message);
  } else if (statusLogs && statusLogs.length > 0) {
    console.log('✅ Recent message status updates:');
    statusLogs.forEach(log => {
      console.log(`   - ${log.status.toUpperCase()} at ${new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    });
    console.log();
  } else {
    console.log('⚠️  No webhook data found in message_status_logs');
    console.log('   This is expected if webhook is not yet configured or no messages sent\n');
  }

  // Check incoming messages
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('direction, created_at')
    .eq('direction', 'incoming')
    .order('created_at', { ascending: false })
    .limit(5);

  if (msgError) {
    console.error('❌ Error querying messages:', msgError.message);
  } else if (messages && messages.length > 0) {
    console.log('✅ Recent incoming messages:');
    messages.forEach(msg => {
      console.log(`   - Received at ${new Date(msg.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    });
    console.log();
  } else {
    console.log('⚠️  No incoming messages found');
    console.log('   Send a test message to your WhatsApp number to verify\n');
  }

  process.exit(0);
}

checkRecentWebhookData();
