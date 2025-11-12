#!/usr/bin/env node

/**
 * Speed Testing Tool
 * Tests message sending speed and helps find optimal rate
 */

const { supabase } = require('./src/config/supabase');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

class SpeedTester {
  constructor() {
    this.testResults = [];
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async getCurrentConfiguration() {
    this.log('\n📊 Current Configuration:', 'cyan');
    this.log('═══════════════════════════════════════', 'cyan');

    const { data: numbers, error } = await supabase
      .from('whatsapp_numbers')
      .select('id, display_name, number, max_send_rate_per_sec, last_stable_rate_per_sec, is_active')
      .eq('is_active', true);

    if (error) {
      this.log(`❌ Error: ${error.message}`, 'red');
      return null;
    }

    if (!numbers || numbers.length === 0) {
      this.log('⚠️  No active WhatsApp numbers found', 'yellow');
      return null;
    }

    numbers.forEach((num, index) => {
      this.log(`\n${index + 1}. ${num.display_name || num.number}`, 'bright');
      this.log(`   ID: ${num.id}`);
      this.log(`   Current Rate: ${num.max_send_rate_per_sec} msg/sec`, 'green');
      this.log(`   Last Stable: ${num.last_stable_rate_per_sec || 'N/A'} msg/sec`);
    });

    return numbers;
  }

  async getRecentCampaigns() {
    this.log('\n📋 Recent Campaigns:', 'cyan');
    this.log('═══════════════════════════════════════', 'cyan');

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, name, status, total_contacts, total_sent, total_failed, created_at, start_time, end_time')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      this.log(`❌ Error: ${error.message}`, 'red');
      return [];
    }

    if (!campaigns || campaigns.length === 0) {
      this.log('⚠️  No campaigns found', 'yellow');
      return [];
    }

    campaigns.forEach((campaign, index) => {
      const duration = (campaign.start_time && campaign.end_time)
        ? Math.floor((new Date(campaign.end_time) - new Date(campaign.start_time)) / 1000)
        : null;

      const speed = duration && campaign.total_sent
        ? Math.round(campaign.total_sent / duration)
        : null;

      this.log(`\n${index + 1}. ${campaign.name}`, 'bright');
      this.log(`   ID: ${campaign.id}`);
      this.log(`   Status: ${campaign.status}`, campaign.status === 'completed' ? 'green' : 'yellow');
      this.log(`   Progress: ${campaign.total_sent}/${campaign.total_contacts}`);

      if (speed) {
        this.log(`   Speed: ${speed} msg/sec`, speed >= 50 ? 'green' : 'yellow');
      }

      if (campaign.total_failed > 0) {
        this.log(`   Failed: ${campaign.total_failed}`, 'red');
      }
    });

    return campaigns;
  }

  async checkRateLimitErrors(minutes = 60) {
    this.log(`\n⚠️  Rate Limit Errors (last ${minutes} minutes):`, 'cyan');
    this.log('═══════════════════════════════════════', 'cyan');

    const { data: errors, error } = await supabase
      .from('send_queue')
      .select('error_message, created_at')
      .ilike('error_message', '%130429%')
      .gte('created_at', new Date(Date.now() - minutes * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      this.log(`❌ Error: ${error.message}`, 'red');
      return;
    }

    if (!errors || errors.length === 0) {
      this.log('✅ No rate limit errors found', 'green');
      return;
    }

    this.log(`❌ Found ${errors.length} rate limit errors`, 'red');
    errors.slice(0, 3).forEach((err, index) => {
      this.log(`\n${index + 1}. ${err.created_at}`);
      this.log(`   ${err.error_message ? err.error_message.substring(0, 100) : 'No details'}...`);
    });
  }

  async suggestOptimalRate(whatsappNumberId) {
    this.log('\n💡 Rate Optimization Suggestions:', 'cyan');
    this.log('═══════════════════════════════════════', 'cyan');

    // Get current rate
    const { data: number } = await supabase
      .from('whatsapp_numbers')
      .select('max_send_rate_per_sec')
      .eq('id', whatsappNumberId)
      .single();

    if (!number) {
      this.log('❌ WhatsApp number not found', 'red');
      return;
    }

    const currentRate = number.max_send_rate_per_sec;

    // Check for recent rate limit errors
    const { count: errorCount } = await supabase
      .from('send_queue')
      .select('id', { count: 'exact', head: true })
      .ilike('error_message', '%130429%')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Check recent campaign success
    const { data: recentCampaigns } = await supabase
      .from('campaigns')
      .select('total_sent, total_failed, total_contacts')
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(5);

    let successRate = 100;
    if (recentCampaigns && recentCampaigns.length > 0) {
      const totalSent = recentCampaigns.reduce((sum, c) => sum + c.total_sent, 0);
      const totalFailed = recentCampaigns.reduce((sum, c) => sum + c.total_failed, 0);
      successRate = totalSent > 0 ? ((totalSent / (totalSent + totalFailed)) * 100) : 100;
    }

    this.log(`Current Rate: ${currentRate} msg/sec`);
    this.log(`Rate Limit Errors (24h): ${errorCount || 0}`);
    this.log(`Success Rate (24h): ${successRate.toFixed(2)}%`, successRate >= 99 ? 'green' : 'yellow');

    // Provide recommendation
    if (errorCount > 0) {
      this.log(`\n❌ RECOMMENDATION: Rate too high`, 'red');
      this.log(`   Current: ${currentRate} msg/sec`);
      this.log(`   Suggested: ${Math.floor(currentRate * 0.7)} msg/sec (30% reduction)`);
      this.log(`   Your WhatsApp tier cannot handle ${currentRate} msg/sec`);
    } else if (successRate >= 99.5) {
      this.log(`\n✅ RECOMMENDATION: Can try increasing rate`, 'green');
      this.log(`   Current: ${currentRate} msg/sec`);
      this.log(`   Test Next: ${Math.floor(currentRate * 1.5)} msg/sec (50% increase)`);
      this.log(`   Safe to test higher rates with small campaigns first`);
    } else if (successRate >= 97) {
      this.log(`\n⚠️  RECOMMENDATION: Current rate is near optimal`, 'yellow');
      this.log(`   Current: ${currentRate} msg/sec`);
      this.log(`   Test Next: ${Math.floor(currentRate * 1.2)} msg/sec (20% increase)`);
      this.log(`   Monitor carefully for rate limit errors`);
    } else {
      this.log(`\n⚠️  RECOMMENDATION: Investigate errors`, 'yellow');
      this.log(`   Success rate below 97% indicates issues`);
      this.log(`   Check error logs before increasing rate`);
    }
  }

  async setRate(whatsappNumberId, newRate) {
    this.log(`\n🔧 Setting new rate...`, 'cyan');

    const { error } = await supabase
      .from('whatsapp_numbers')
      .update({
        max_send_rate_per_sec: newRate,
        last_updated: new Date().toISOString()
      })
      .eq('id', whatsappNumberId);

    if (error) {
      this.log(`❌ Error: ${error.message}`, 'red');
      return false;
    }

    this.log(`✅ Successfully set rate to ${newRate} msg/sec`, 'green');
    this.log(`\n⚠️  Important:`, 'yellow');
    this.log(`   1. Test with small campaign first (100-200 contacts)`);
    this.log(`   2. Monitor for rate limit errors (130429)`);
    this.log(`   3. Use 'npm run monitor' to watch real-time speed`);
    this.log(`   4. If you see 429 errors, reduce rate immediately\n`);

    return true;
  }

  async runFullTest() {
    this.log('\n🚀 WhatsApp Message Speed Testing Tool', 'bright');
    this.log('═══════════════════════════════════════\n', 'bright');

    // Get configuration
    const numbers = await this.getCurrentConfiguration();
    if (!numbers || numbers.length === 0) return;

    // Get recent campaigns
    await this.getRecentCampaigns();

    // Check for rate limit errors
    await this.checkRateLimitErrors(60);

    // Suggest optimal rate for first number
    if (numbers.length > 0) {
      await this.suggestOptimalRate(numbers[0].id);
    }

    this.log('\n═══════════════════════════════════════', 'cyan');
    this.log('📖 For detailed testing guide, see:', 'bright');
    this.log('   /root/cloudAPI/backend/SPEED_TESTING_GUIDE.md\n');
  }
}

// CLI Interface
async function main() {
  const tester = new SpeedTester();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Run full test
    await tester.runFullTest();
  } else if (args[0] === 'set-rate' && args[1] && args[2]) {
    // Set rate: node test-speed.js set-rate <whatsapp_number_id> <rate>
    const whatsappNumberId = args[1];
    const newRate = parseInt(args[2]);

    if (isNaN(newRate) || newRate < 10 || newRate > 1000) {
      tester.log('❌ Invalid rate. Must be between 10 and 1000', 'red');
      process.exit(1);
    }

    await tester.setRate(whatsappNumberId, newRate);
  } else if (args[0] === 'suggest' && args[1]) {
    // Suggest rate: node test-speed.js suggest <whatsapp_number_id>
    await tester.suggestOptimalRate(args[1]);
  } else {
    tester.log('Usage:', 'bright');
    tester.log('  node test-speed.js                           # Run full test');
    tester.log('  node test-speed.js set-rate <id> <rate>     # Set new rate');
    tester.log('  node test-speed.js suggest <id>              # Get rate suggestion\n');
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
