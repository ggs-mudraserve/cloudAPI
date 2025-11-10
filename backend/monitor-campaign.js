#!/usr/bin/env node

/**
 * Campaign Speed Monitor
 * Real-time monitoring of message sending rate for WhatsApp campaigns
 */

const { supabase } = require('./src/config/supabase');

// ANSI color codes for terminal output
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

class CampaignMonitor {
  constructor(campaignId) {
    this.campaignId = campaignId;
    this.previousStats = null;
    this.startTime = Date.now();
    this.samples = []; // Store last 10 samples for rolling average
    this.maxSamples = 10;
  }

  /**
   * Clear console and move cursor to top
   */
  clearScreen() {
    console.clear();
    process.stdout.write('\x1Bc');
  }

  /**
   * Format number with commas
   */
  formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Format time duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Create progress bar
   */
  createProgressBar(percentage, width = 40) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return bar;
  }

  /**
   * Fetch current campaign statistics
   */
  async fetchStats() {
    try {
      // Get campaign details
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          status,
          total_contacts,
          sent_count,
          failed_count,
          start_time,
          end_time,
          whatsapp_number_id,
          whatsapp_numbers (
            display_name,
            max_send_rate_per_sec
          )
        `)
        .eq('id', this.campaignId)
        .single();

      if (campaignError) {
        throw campaignError;
      }

      // Get queue statistics
      const { data: queueStats, error: queueError } = await supabase
        .from('send_queue')
        .select('status')
        .eq('campaign_id', this.campaignId);

      if (queueError) {
        throw queueError;
      }

      // Count by status
      const stats = {
        sent: 0,
        failed: 0,
        ready: 0,
        processing: 0
      };

      queueStats.forEach(item => {
        if (stats.hasOwnProperty(item.status)) {
          stats[item.status]++;
        }
      });

      return {
        campaign,
        queueStats: stats,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Error fetching stats:', error.message);
      return null;
    }
  }

  /**
   * Calculate sending speed
   */
  calculateSpeed(currentStats) {
    if (!this.previousStats) {
      return 0;
    }

    const timeDiff = (currentStats.timestamp - this.previousStats.timestamp) / 1000; // seconds
    const sentDiff = currentStats.queueStats.sent - this.previousStats.queueStats.sent;

    const speed = timeDiff > 0 ? sentDiff / timeDiff : 0;

    // Add to samples for rolling average
    this.samples.push(speed);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    return speed;
  }

  /**
   * Calculate rolling average speed
   */
  getAverageSpeed() {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((a, b) => a + b, 0);
    return sum / this.samples.length;
  }

  /**
   * Display statistics in terminal
   */
  displayStats(stats) {
    if (!stats) {
      console.log(`${colors.red}Failed to fetch campaign statistics${colors.reset}`);
      return;
    }

    const { campaign, queueStats } = stats;
    const currentSpeed = this.calculateSpeed(stats);
    const avgSpeed = this.getAverageSpeed();

    // Calculate progress
    const totalSent = queueStats.sent + queueStats.failed;
    const totalQueued = campaign.total_contacts;
    const remaining = totalQueued - totalSent;
    const progressPercent = totalQueued > 0 ? (totalSent / totalQueued) * 100 : 0;

    // Calculate ETA
    let eta = 'Calculating...';
    if (avgSpeed > 0 && remaining > 0) {
      const etaSeconds = remaining / avgSpeed;
      eta = this.formatDuration(etaSeconds * 1000);
    } else if (remaining === 0) {
      eta = 'Completed';
    }

    // Calculate elapsed time
    const elapsedMs = campaign.start_time
      ? Date.now() - new Date(campaign.start_time).getTime()
      : Date.now() - this.startTime;
    const elapsed = this.formatDuration(elapsedMs);

    // Overall average (total sent / elapsed time)
    const overallAvgSpeed = campaign.start_time
      ? (totalSent / ((Date.now() - new Date(campaign.start_time).getTime()) / 1000))
      : 0;

    this.clearScreen();

    // Header
    console.log(`${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}║           WHATSAPP CAMPAIGN SPEED MONITOR                      ║${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log();

    // Campaign Info
    console.log(`${colors.bright}Campaign:${colors.reset} ${campaign.name}`);
    console.log(`${colors.bright}Status:${colors.reset} ${this.getStatusColor(campaign.status)}${campaign.status.toUpperCase()}${colors.reset}`);
    console.log(`${colors.bright}WhatsApp Number:${colors.reset} ${campaign.whatsapp_numbers.display_name}`);
    console.log();

    // Progress Bar
    console.log(`${colors.bright}Progress:${colors.reset}`);
    console.log(`${this.createProgressBar(progressPercent)} ${colors.bright}${progressPercent.toFixed(1)}%${colors.reset}`);
    console.log();

    // Message Statistics
    console.log(`${colors.bright}${colors.green}━━━━━━━━━━━━━━━━ MESSAGE STATISTICS ━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log();
    console.log(`  ${colors.bright}Total Contacts:${colors.reset}     ${colors.yellow}${this.formatNumber(totalQueued)}${colors.reset}`);
    console.log(`  ${colors.bright}Messages Sent:${colors.reset}      ${colors.green}${this.formatNumber(queueStats.sent)}${colors.reset}`);
    console.log(`  ${colors.bright}Failed:${colors.reset}             ${colors.red}${this.formatNumber(queueStats.failed)}${colors.reset}`);
    console.log(`  ${colors.bright}Pending:${colors.reset}            ${colors.blue}${this.formatNumber(queueStats.ready)}${colors.reset}`);
    console.log(`  ${colors.bright}Processing:${colors.reset}         ${colors.magenta}${this.formatNumber(queueStats.processing)}${colors.reset}`);
    console.log(`  ${colors.bright}Remaining:${colors.reset}          ${colors.cyan}${this.formatNumber(remaining)}${colors.reset}`);
    console.log();

    // Speed Metrics
    console.log(`${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━ SPEED METRICS ━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log();
    console.log(`  ${colors.bright}Current Speed:${colors.reset}      ${colors.green}${currentSpeed.toFixed(2)} msg/sec${colors.reset}`);
    console.log(`  ${colors.bright}Average Speed (10s):${colors.reset} ${colors.green}${avgSpeed.toFixed(2)} msg/sec${colors.reset}`);
    console.log(`  ${colors.bright}Overall Average:${colors.reset}    ${colors.green}${overallAvgSpeed.toFixed(2)} msg/sec${colors.reset}`);
    console.log(`  ${colors.bright}Configured Rate:${colors.reset}    ${colors.yellow}${campaign.whatsapp_numbers.max_send_rate_per_sec} msg/sec${colors.reset}`);
    console.log();

    // Time Statistics
    console.log(`${colors.bright}${colors.magenta}━━━━━━━━━━━━━━━━━ TIME STATISTICS ━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log();
    console.log(`  ${colors.bright}Time Elapsed:${colors.reset}       ${colors.cyan}${elapsed}${colors.reset}`);
    console.log(`  ${colors.bright}ETA:${colors.reset}                ${colors.cyan}${eta}${colors.reset}`);
    console.log();

    // Success Rate
    const successRate = totalSent > 0 ? ((queueStats.sent / totalSent) * 100) : 0;
    console.log(`${colors.bright}Success Rate:${colors.reset}       ${this.getSuccessRateColor(successRate)}${successRate.toFixed(2)}%${colors.reset}`);
    console.log();

    // Footer
    console.log(`${colors.bright}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}Last Updated:${colors.reset} ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    console.log(`Press ${colors.bright}Ctrl+C${colors.reset} to stop monitoring`);

    // Store current stats for next iteration
    this.previousStats = stats;
  }

  /**
   * Get color for status
   */
  getStatusColor(status) {
    const statusColors = {
      'running': colors.green,
      'completed': colors.blue,
      'paused': colors.yellow,
      'failed': colors.red,
      'scheduled': colors.cyan
    };
    return statusColors[status] || colors.reset;
  }

  /**
   * Get color for success rate
   */
  getSuccessRateColor(rate) {
    if (rate >= 95) return colors.green;
    if (rate >= 85) return colors.yellow;
    return colors.red;
  }

  /**
   * Start monitoring
   */
  async start(intervalMs = 1000) {
    console.log(`${colors.bright}Starting campaign monitor for Campaign ID: ${this.campaignId}${colors.reset}`);
    console.log('Fetching initial data...\n');

    // Initial fetch
    const initialStats = await this.fetchStats();
    if (!initialStats) {
      console.error('Failed to fetch campaign data. Please check the campaign ID.');
      process.exit(1);
    }

    this.displayStats(initialStats);

    // Set up interval
    this.interval = setInterval(async () => {
      const stats = await this.fetchStats();
      if (stats) {
        this.displayStats(stats);

        // Auto-exit if campaign completed
        if (stats.campaign.status === 'completed' || stats.campaign.status === 'failed') {
          console.log(`\n${colors.bright}${colors.yellow}Campaign ${stats.campaign.status}. Monitoring stopped.${colors.reset}`);
          this.stop();
        }
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      console.log(`\n${colors.bright}Monitoring stopped.${colors.reset}`);
      process.exit(0);
    }
  }
}

// Main execution
const campaignId = process.argv[2];

if (!campaignId) {
  console.log(`${colors.red}Error: Campaign ID required${colors.reset}`);
  console.log(`\n${colors.bright}Usage:${colors.reset}`);
  console.log(`  node monitor-campaign.js <campaign_id>`);
  console.log(`\n${colors.bright}Example:${colors.reset}`);
  console.log(`  node monitor-campaign.js 123e4567-e89b-12d3-a456-426614174000`);
  console.log(`\n${colors.bright}Or use npm script:${colors.reset}`);
  console.log(`  npm run monitor <campaign_id>`);
  process.exit(1);
}

// Create and start monitor
const monitor = new CampaignMonitor(campaignId);

// Handle graceful shutdown
process.on('SIGINT', () => {
  monitor.stop();
});

process.on('SIGTERM', () => {
  monitor.stop();
});

// Start monitoring (update every second)
monitor.start(1000);
