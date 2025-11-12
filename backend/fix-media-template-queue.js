const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Fix failed messages in send_queue that have media templates
 * The bug: Variables were not shifted to account for media URL in header
 */
async function fixMediaTemplateQueue() {
  console.log('🔍 Starting fix for media template queue entries...\n');

  try {
    // Step 1: Get all failed messages
    const { data: failedMessages, error: fetchError } = await supabase
      .from('send_queue')
      .select('id, campaign_id, template_name, payload, whatsapp_number_id, phone')
      .eq('status', 'failed')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('❌ Error fetching failed messages:', fetchError);
      return;
    }

    console.log(`📊 Found ${failedMessages.length} failed messages\n`);

    if (failedMessages.length === 0) {
      console.log('✅ No failed messages to fix!');
      return;
    }

    // Step 2: Group by template_name and whatsapp_number_id to fetch templates
    const templateKeys = new Set();
    failedMessages.forEach(msg => {
      templateKeys.add(`${msg.whatsapp_number_id}:${msg.template_name}`);
    });

    // Step 3: Fetch all relevant templates
    const uniqueTemplates = [...templateKeys].map(key => {
      const [whatsappNumberId, templateName] = key.split(':');
      return { whatsappNumberId, templateName };
    });

    const templateMap = {};

    for (const { whatsappNumberId, templateName } of uniqueTemplates) {
      const { data: template, error: templateError } = await supabase
        .from('templates')
        .select('name, components')
        .eq('whatsapp_number_id', whatsappNumberId)
        .eq('name', templateName)
        .single();

      if (!templateError && template) {
        templateMap[`${whatsappNumberId}:${templateName}`] = template;
      }
    }

    console.log(`📋 Fetched ${Object.keys(templateMap).length} unique templates\n`);

    // Step 4: Process each failed message
    let fixedCount = 0;
    let skippedCount = 0;

    for (const message of failedMessages) {
      const templateKey = `${message.whatsapp_number_id}:${message.template_name}`;
      const template = templateMap[templateKey];

      if (!template) {
        console.log(`⚠️  Skipping message ${message.id} - template not found`);
        skippedCount++;
        continue;
      }

      // Check if template has media header
      const headerComponent = template.components.find(c => c.type === 'HEADER');
      const hasMediaHeader = headerComponent &&
        (headerComponent.format === 'VIDEO' || headerComponent.format === 'IMAGE' || headerComponent.format === 'DOCUMENT');

      if (!hasMediaHeader) {
        console.log(`⚠️  Skipping message ${message.id} - template has no media header`);
        skippedCount++;
        continue;
      }

      // Get media URL from template example
      const mediaUrl = headerComponent.example?.header_handle?.[0];

      if (!mediaUrl) {
        console.log(`⚠️  Skipping message ${message.id} - no example media URL in template`);
        skippedCount++;
        continue;
      }

      // Current payload (missing media URL)
      const currentPayload = message.payload;

      // Build corrected payload with media URL as var1, shift others
      const correctedPayload = {
        var1: mediaUrl,
        ...Object.fromEntries(
          Object.entries(currentPayload).map(([key, value]) => {
            const varNum = parseInt(key.replace('var', ''));
            return [`var${varNum + 1}`, value];
          })
        )
      };

      console.log(`🔧 Fixing message ${message.id}:`);
      console.log(`   Template: ${message.template_name}`);
      console.log(`   Phone: ${message.phone}`);
      console.log(`   Old payload:`, currentPayload);
      console.log(`   New payload:`, correctedPayload);

      // Update the message in send_queue
      const { error: updateError } = await supabase
        .from('send_queue')
        .update({
          payload: correctedPayload,
          status: 'ready',  // Reset to ready so it can be retried
          retry_count: 0,   // Reset retry count
          error_message: null,
          next_retry_at: null
        })
        .eq('id', message.id);

      if (updateError) {
        console.error(`   ❌ Error updating message ${message.id}:`, updateError);
      } else {
        console.log(`   ✅ Fixed and reset to ready\n`);
        fixedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Total failed messages: ${failedMessages.length}`);
    console.log(`   Fixed and reset: ${fixedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log('='.repeat(60));

    if (fixedCount > 0) {
      console.log('\n✅ Fixed messages are now ready to be processed!');
      console.log('   Resume the campaigns to retry sending.');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the fix
fixMediaTemplateQueue()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
