#!/usr/bin/env node

/**
 * Auto-fix Template Index Mismatch
 *
 * This script automatically detects and fixes campaigns where the current_template_index
 * is ahead of templates that still have pending messages. This is a common issue where
 * messages get stuck in earlier templates while the system thinks it has moved forward.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fixAllRunningCampaigns() {
  console.log('=== AUTO-FIX TEMPLATE INDEX CHECKER ===');
  console.log(`Starting at: ${new Date().toLocaleString()}`);
  console.log('----------------------------------------\n');

  // Get all running campaigns
  const { data: runningCampaigns, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, name, current_template_index, template_names, status')
    .eq('status', 'running');

  if (campaignError) {
    console.error('Error fetching campaigns:', campaignError);
    return;
  }

  if (!runningCampaigns || runningCampaigns.length === 0) {
    console.log('No running campaigns found.');
    return;
  }

  console.log(`Found ${runningCampaigns.length} running campaign(s)\n`);

  let fixedCount = 0;

  for (const campaign of runningCampaigns) {
    console.log(`Checking campaign: ${campaign.name} (${campaign.id})`);
    console.log(`Current template index: ${campaign.current_template_index}`);

    // Get stuck messages grouped by template_order
    const { data: stuckMessages, error: queueError } = await supabase
      .from('send_queue')
      .select('template_order, status')
      .eq('campaign_id', campaign.id)
      .in('status', ['ready', 'processing']);

    if (queueError) {
      console.error(`  Error checking queue for campaign ${campaign.id}:`, queueError);
      continue;
    }

    if (!stuckMessages || stuckMessages.length === 0) {
      console.log('  No stuck messages found.\n');
      continue;
    }

    // Group messages by template_order
    const messagesByTemplate = {};
    let lowestStuckTemplate = null;

    stuckMessages.forEach(msg => {
      if (!messagesByTemplate[msg.template_order]) {
        messagesByTemplate[msg.template_order] = 0;
      }
      messagesByTemplate[msg.template_order]++;

      if (lowestStuckTemplate === null || msg.template_order < lowestStuckTemplate) {
        lowestStuckTemplate = msg.template_order;
      }
    });

    console.log('  Stuck messages by template:');
    Object.entries(messagesByTemplate)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([template, count]) => {
        console.log(`    Template ${template}: ${count} messages`);
      });

    // Check if we need to fix the index
    if (lowestStuckTemplate !== null && lowestStuckTemplate < campaign.current_template_index) {
      console.log(`  ⚠️  ISSUE DETECTED!`);
      console.log(`  Campaign is at template ${campaign.current_template_index}, but template ${lowestStuckTemplate} has stuck messages`);
      console.log(`  Resetting template index to ${lowestStuckTemplate}...`);

      // Fix the template index
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({
          current_template_index: lowestStuckTemplate
        })
        .eq('id', campaign.id);

      if (updateError) {
        console.error('  ❌ Error updating campaign:', updateError);
      } else {
        console.log('  ✅ Template index reset successfully!');
        fixedCount++;

        // Log the fix for audit
        await supabase
          .from('system_logs')
          .insert({
            type: 'template_index_fix',
            campaign_id: campaign.id,
            details: {
              campaign_name: campaign.name,
              old_index: campaign.current_template_index,
              new_index: lowestStuckTemplate,
              stuck_messages: messagesByTemplate
            },
            created_at: new Date().toISOString()
          })
          .catch(err => console.log('  Note: Could not log fix (system_logs table may not exist)'));
      }
    } else if (stuckMessages.length > 0) {
      // Check if messages have been stuck for too long
      const { data: lastActivity } = await supabase
        .from('send_queue')
        .select('updated_at')
        .eq('campaign_id', campaign.id)
        .eq('status', 'sent')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (lastActivity) {
        const minutesSinceLastSend = Math.floor((new Date() - new Date(lastActivity.updated_at)) / (1000 * 60));
        console.log(`  Last successful send: ${minutesSinceLastSend} minutes ago`);

        if (minutesSinceLastSend > 10) {
          console.log('  ⚠️  Campaign appears stuck (no sends in 10+ minutes)');
          console.log('  Consider restarting PM2 process: pm2 restart whatsapp-app');
        }
      }
    } else {
      console.log('  ✓ No issues detected');
    }

    console.log('');
  }

  console.log('----------------------------------------');
  console.log(`Summary: Fixed ${fixedCount} campaign(s)`);

  if (fixedCount > 0) {
    console.log('The queue processor should pick up the fixed campaigns on the next poll cycle.');
  }
}

// Function to check a specific campaign (can be called with campaign ID as argument)
async function fixSpecificCampaign(campaignId) {
  console.log(`\n=== FIXING SPECIFIC CAMPAIGN: ${campaignId} ===\n`);

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    console.error('Campaign not found or error:', campaignError);
    return;
  }

  // Temporarily set the campaign to running to check it
  const wasNotRunning = campaign.status !== 'running';
  if (wasNotRunning) {
    await supabase
      .from('campaigns')
      .update({ status: 'running' })
      .eq('id', campaignId);
  }

  await fixAllRunningCampaigns();

  // Restore original status if it wasn't running
  if (wasNotRunning) {
    await supabase
      .from('campaigns')
      .update({ status: campaign.status })
      .eq('id', campaignId);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length > 0) {
  // If campaign ID provided, fix specific campaign
  fixSpecificCampaign(args[0]).catch(console.error);
} else {
  // Otherwise, check all running campaigns
  fixAllRunningCampaigns().catch(console.error);
}

// Export for use in other scripts
module.exports = { fixAllRunningCampaigns, fixSpecificCampaign };