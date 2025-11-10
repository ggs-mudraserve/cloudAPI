#!/usr/bin/env node

/**
 * List Campaigns Helper
 * Shows all campaigns with their IDs for easy monitoring
 */

const { supabase } = require('./src/config/supabase');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function getStatusColor(status) {
  const statusColors = {
    'running': colors.green,
    'completed': colors.blue,
    'paused': colors.yellow,
    'failed': colors.red,
    'scheduled': colors.cyan
  };
  return statusColors[status] || colors.reset;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function listCampaigns() {
  try {
    console.log(`${colors.bright}${colors.cyan}Fetching campaigns...${colors.reset}\n`);

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select(`
        id,
        name,
        status,
        total_contacts,
        sent_count,
        failed_count,
        created_at,
        start_time,
        scheduled_start_time,
        whatsapp_numbers (
          display_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log(`${colors.yellow}No campaigns found.${colors.reset}`);
      return;
    }

    console.log(`${colors.bright}Total campaigns: ${campaigns.length}${colors.reset}\n`);

    // Print header
    console.log(`${colors.bright}╔════════════════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}║                                    CAMPAIGNS LIST                                          ║${colors.reset}`);
    console.log(`${colors.bright}╚════════════════════════════════════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();

    campaigns.forEach((campaign, index) => {
      const statusColor = getStatusColor(campaign.status);
      const progress = campaign.total_contacts > 0
        ? ((campaign.sent_count + campaign.failed_count) / campaign.total_contacts * 100).toFixed(1)
        : 0;

      console.log(`${colors.bright}Campaign ${index + 1}:${colors.reset}`);
      console.log(`  ${colors.bright}ID:${colors.reset}              ${colors.cyan}${campaign.id}${colors.reset}`);
      console.log(`  ${colors.bright}Name:${colors.reset}            ${campaign.name}`);
      console.log(`  ${colors.bright}Status:${colors.reset}          ${statusColor}${campaign.status.toUpperCase()}${colors.reset}`);
      console.log(`  ${colors.bright}WhatsApp Number:${colors.reset} ${campaign.whatsapp_numbers?.display_name || 'N/A'}`);
      console.log(`  ${colors.bright}Total Contacts:${colors.reset}  ${campaign.total_contacts}`);
      console.log(`  ${colors.bright}Progress:${colors.reset}        ${campaign.sent_count} sent, ${campaign.failed_count} failed (${progress}%)`);

      if (campaign.status === 'scheduled') {
        console.log(`  ${colors.bright}Scheduled For:${colors.reset}   ${formatDate(campaign.scheduled_start_time)} IST`);
      } else if (campaign.start_time) {
        console.log(`  ${colors.bright}Started At:${colors.reset}      ${formatDate(campaign.start_time)} IST`);
      }

      console.log(`  ${colors.bright}Created At:${colors.reset}      ${formatDate(campaign.created_at)} IST`);
      console.log();
      console.log(`${colors.cyan}${'─'.repeat(90)}${colors.reset}`);
      console.log();
    });

    // Show running campaigns
    const runningCampaigns = campaigns.filter(c => c.status === 'running');
    if (runningCampaigns.length > 0) {
      console.log(`${colors.bright}${colors.green}✅ ${runningCampaigns.length} campaign(s) currently running${colors.reset}`);
      console.log(`\n${colors.bright}To monitor a running campaign:${colors.reset}`);
      console.log(`  npm run monitor ${runningCampaigns[0].id}`);
      console.log();
    }

    const scheduledCampaigns = campaigns.filter(c => c.status === 'scheduled');
    if (scheduledCampaigns.length > 0) {
      console.log(`${colors.bright}${colors.cyan}⏰ ${scheduledCampaigns.length} campaign(s) scheduled${colors.reset}\n`);
    }

  } catch (error) {
    console.error(`${colors.red}Error fetching campaigns:${colors.reset}`, error.message);
    process.exit(1);
  }
}

listCampaigns().then(() => {
  process.exit(0);
});
