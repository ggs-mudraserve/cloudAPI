# Campaign Speed Monitoring Guide

This guide explains how to monitor the message sending speed for your WhatsApp campaigns.

## Prerequisites

- Backend server must be running (`pm2 list` to check)
- Campaign must be created and running

## Quick Start

### 1. List All Campaigns

To see all your campaigns and get their IDs:

```bash
cd /root/cloudAPI/backend
npm run list-campaigns
```

This will show:
- Campaign ID (needed for monitoring)
- Campaign name
- Current status
- Progress (sent/failed counts)
- Scheduled/start times

### 2. Monitor a Campaign

Once you have the campaign ID, start monitoring:

```bash
npm run monitor <campaign_id>
```

**Example:**
```bash
npm run monitor 123e4567-e89b-12d3-a456-426614174000
```

## What You'll See

The monitor displays real-time statistics updated every second:

### Message Statistics
- **Total Contacts**: Total messages to send
- **Messages Sent**: Successfully sent messages
- **Failed**: Failed messages (after 3 retries)
- **Pending**: Messages waiting in queue
- **Processing**: Messages currently being sent
- **Remaining**: Messages still to be processed

### Speed Metrics
- **Current Speed**: Instantaneous sending rate (msg/sec)
- **Average Speed (10s)**: Rolling average over last 10 seconds
- **Overall Average**: Average since campaign started
- **Configured Rate**: Maximum rate limit from database

### Time Statistics
- **Time Elapsed**: How long campaign has been running
- **ETA**: Estimated time to completion
- **Success Rate**: Percentage of successfully sent messages

### Progress Bar
Visual representation of campaign completion percentage

## Campaign Flow

1. **Ready** → Messages waiting to be picked up
2. **Processing** → Currently being sent via WhatsApp API
3. **Sent** → Successfully delivered to WhatsApp
4. **Failed** → Failed after 3 retry attempts

## Understanding the Speed

### Adaptive Rate Control

The system automatically adjusts sending speed based on:

- **Increase (+10%)**: When error rate < 1% for 5 continuous minutes
- **Decrease (-20%)**: After 3 consecutive 429 (rate limit) errors
- **Range**: 10 - 1000 messages per second
- **Starting Rate**: 60 messages per second for new numbers

### What Affects Speed

1. **WhatsApp Rate Limits**: API throttling (429 errors)
2. **Template Issues**: Invalid templates slow down processing
3. **Network Latency**: Server → WhatsApp API delays
4. **Queue Processing**: Runs every 5 seconds (configurable)
5. **Concurrent Campaigns**: Sequential execution per WhatsApp number

## Monitoring Multiple Campaigns

You can monitor multiple campaigns by opening separate terminal windows:

**Terminal 1:**
```bash
npm run monitor <campaign_id_1>
```

**Terminal 2:**
```bash
npm run monitor <campaign_id_2>
```

## Stopping the Monitor

Press `Ctrl+C` to stop monitoring (campaign continues running)

The monitor automatically stops when campaign status changes to:
- `completed`
- `failed`

## Troubleshooting

### "Campaign ID required" error
Make sure you're providing the campaign ID:
```bash
npm run monitor <campaign_id>
```

### "Failed to fetch campaign data"
- Check campaign ID is correct
- Verify database connection in `.env`
- Ensure campaign exists: `npm run list-campaigns`

### Monitor shows 0 msg/sec
- Campaign may be paused
- Queue processor may not be running (check PM2)
- All messages may be in retry delay
- Check server logs: `pm2 logs whatsapp-app`

### Speed is slower than expected
- Check `max_send_rate_per_sec` in database
- Look for 429 errors in logs (rate limiting)
- Verify WhatsApp number is active
- Check network connectivity

## Advanced Usage

### Direct Node Execution
```bash
node monitor-campaign.js <campaign_id>
```

### Custom Update Interval
Edit `monitor-campaign.js` line 395:
```javascript
monitor.start(2000); // Update every 2 seconds instead of 1
```

## Real-Time Speed Calculation

Speed is calculated as:
```
Current Speed = (Messages Sent Now - Messages Sent 1s ago) / 1 second
Average Speed = Sum of last 10 samples / 10
Overall Average = Total Sent / Time Elapsed
```

## Campaign States

| Status | Description | Can Monitor? |
|--------|-------------|--------------|
| scheduled | Waiting for scheduled time | ❌ No |
| running | Currently sending messages | ✅ Yes |
| paused | Temporarily stopped | ✅ Yes* |
| completed | All messages processed | ✅ Yes** |
| failed | Campaign failed | ✅ Yes** |

*Paused campaigns show 0 msg/sec
**Monitor auto-exits after displaying final stats

## Best Practices

1. **Start monitoring before campaign launch** to see initial speed
2. **Watch for consistent speed** - indicates healthy sending
3. **Monitor success rate** - should be >95% for healthy campaigns
4. **Check ETA periodically** - helps plan subsequent campaigns
5. **Save campaign ID** - for future reference and analytics

## Performance Notes

- Monitor has minimal impact on system resources
- Safe to run alongside production workloads
- Updates every 1 second by default
- Queries only campaign and queue tables
- No modification of data (read-only)

## Example Output

```
╔════════════════════════════════════════════════════════════════╗
║           WHATSAPP CAMPAIGN SPEED MONITOR                      ║
╚════════════════════════════════════════════════════════════════╝

Campaign: Diwali Sale 2024
Status: RUNNING
WhatsApp Number: Main Sales Line

Progress:
████████████████████████░░░░░░░░░░░░░░░░ 62.5%

━━━━━━━━━━━━━━━━ MESSAGE STATISTICS ━━━━━━━━━━━━━━━━

  Total Contacts:     2,000
  Messages Sent:      1,240
  Failed:             10
  Pending:            735
  Processing:         15
  Remaining:          750

━━━━━━━━━━━━━━━━━ SPEED METRICS ━━━━━━━━━━━━━━━━━

  Current Speed:      58.50 msg/sec
  Average Speed (10s): 57.80 msg/sec
  Overall Average:    56.20 msg/sec
  Configured Rate:    60 msg/sec

━━━━━━━━━━━━━━━━━ TIME STATISTICS ━━━━━━━━━━━━━━━━

  Time Elapsed:       22m 4s
  ETA:                13m 0s

Success Rate:       99.20%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Last Updated: 10/11/2025, 2:30:45 PM IST
Press Ctrl+C to stop monitoring
```

## Support

For issues or questions:
1. Check server logs: `pm2 logs whatsapp-app`
2. Verify queue processor: `pm2 list`
3. Review campaign status in database
4. Check WhatsApp API status

---

**Version:** 1.0.0
**Last Updated:** November 2025
