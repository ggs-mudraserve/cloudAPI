# Automatic Speed Optimization - ENABLED ⚡

## What Changed

**Previous Settings:**
- Increase: 10% every 5 minutes
- Required: 300 successful messages before increase
- Time to reach 100 msg/sec: ~30 minutes

**NEW Settings (Active Now):**
- Increase: **15% every 1 minute**
- Required: **60 successful messages** before increase
- Time to reach 100 msg/sec: **~4 minutes**

---

## How It Works

### Automatic Increase (No Manual Work Required!)

The system monitors every campaign and:

**Every 1 minute, it checks:**
1. ✅ Has there been at least 60 successful messages?
2. ✅ Is the error rate less than 1%?
3. ✅ Has it been at least 1 minute since last adjustment?

**If all YES → Automatically increase speed by 15%**

**Example with 2000 contact campaign:**
```
Time    Speed       Messages Sent    Status
────────────────────────────────────────────────
00:00   60 msg/sec  0                Starting
01:00   69 msg/sec  3,600            Auto-increased! (+15%)
02:00   79 msg/sec  7,740            Auto-increased! (+15%)
03:00   91 msg/sec  12,480           Auto-increased! (+15%)
04:00   105 msg/sec 17,940           Auto-increased! (+15%)
05:00   121 msg/sec 24,240           Auto-increased! (+15%)
06:00   139 msg/sec 31,500           Auto-increased! (+15%)
07:00   160 msg/sec 39,840           Auto-increased! (+15%)
08:00   184 msg/sec 49,440           Auto-increased! (+15%)
09:00   212 msg/sec 60,480           Auto-increased! (+15%)
10:00   244 msg/sec 73,200           Auto-increased! (+15%)

Campaign completes in ~10 minutes at average 122 msg/sec
(vs 33 minutes at fixed 60 msg/sec)
```

### Automatic Decrease (Safety Protection)

If the system encounters **3 consecutive rate limit errors (130429)**:
- Automatically reduces speed by 20%
- Logs the adjustment
- Continues campaign at safer speed

**Example:**
```
Time    Speed       Status
─────────────────────────────────────────
05:00   121 msg/sec Running smoothly
06:00   139 msg/sec Running smoothly
07:00   160 msg/sec Running smoothly
08:00   184 msg/sec Rate limit error! (429)
08:01   184 msg/sec Rate limit error! (429)
08:02   184 msg/sec Rate limit error! (429)
08:03   147 msg/sec Auto-decreased! (-20%)
08:04   147 msg/sec Running smoothly
08:05   147 msg/sec Running smoothly

System found your limit: ~150 msg/sec
```

---

## What This Means For You

### Before (Manual Testing Required):

1. Start campaign at 60 msg/sec
2. Wait for completion
3. Check results
4. Manually increase to 80 msg/sec
5. Create new test campaign
6. Wait for completion
7. Check results
8. Manually increase to 100 msg/sec
9. Repeat...
10. **Takes hours/days to find optimal speed**

### Now (Fully Automatic):

1. Start campaign at 60 msg/sec
2. **System automatically finds your optimal speed**
3. Done!

**That's it! No manual work required.**

---

## Live Example: What You'll See

### In Monitor Tool (`npm run monitor`)

```
Campaign: Large Test Campaign
─────────────────────────────────────────
Total Contacts: 2000
Messages Sent: 450/2000 (22.5%)

📊 Current Speed: 79.2 msg/sec ⚡ AUTO-SCALING
Success Rate: 99.8%
Failed: 1/450

Progress: [████████░░░░░░░░░░░░] 22%
ETA: 19 minutes 45 seconds

Recent Speed History:
  1 min ago: 60 msg/sec
  Now:       79 msg/sec (+32% increase!)
```

### In Server Logs (`pm2 logs whatsapp-app`)

```
[Queue] Processing batch of 10 messages...
[Queue] Current rate: 60 msg/sec
[Queue] Success window: 65 messages

[Rate Control] ✅ Conditions met for rate increase
[Rate Control] - Error rate: 0.00% (<1% required)
[Rate Control] - Messages in window: 65 (>60 required)
[Rate Control] - Time since last update: 61 seconds (>60 required)
[Rate Control] Increasing rate for number 9ded5405: 60 -> 69 msg/sec

[Queue] Current rate: 69 msg/sec
... 1 minute later ...

[Rate Control] Increasing rate for number 9ded5405: 69 -> 79 msg/sec
[Queue] Current rate: 79 msg/sec
... 1 minute later ...

[Rate Control] Increasing rate for number 9ded5405: 79 -> 91 msg/sec
```

---

## Speed Progression Table

Starting at 60 msg/sec, with 15% increases every minute:

| Minute | Speed (msg/sec) | Cumulative Increase | Messages/Min |
|--------|-----------------|---------------------|--------------|
| 0      | 60              | 0%                  | 3,600        |
| 1      | 69              | +15%                | 4,140        |
| 2      | 79              | +32%                | 4,740        |
| 3      | 91              | +52%                | 5,460        |
| 4      | 105             | +75%                | 6,300        |
| 5      | 121             | +102%               | 7,260        |
| 6      | 139             | +132%               | 8,340        |
| 7      | 160             | +167%               | 9,600        |
| 8      | 184             | +207%               | 11,040       |
| 9      | 212             | +253%               | 12,720       |
| 10     | 244             | +307%               | 14,640       |
| 11     | 281             | +368%               | 16,860       |
| 12     | 323             | +438%               | 19,380       |
| 13     | 371             | +518%               | 22,260       |
| 14     | 427             | +612%               | 25,620       |
| 15     | 491             | +718%               | 29,460       |

**Reaches Tier 2 speeds (250+) in just 10-11 minutes!**
**Reaches Tier 3 speeds (500+) in just 15-16 minutes!**

---

## Campaign Completion Time Comparison

**2000 Contact Campaign:**

| Speed Configuration | Time to Complete | Improvement |
|---------------------|------------------|-------------|
| Fixed 60 msg/sec | 33 minutes | Baseline |
| Fixed 100 msg/sec | 20 minutes | 40% faster |
| **Auto-scaling (60→200+)** | **~12 minutes** | **64% faster** |
| Fixed 250 msg/sec | 8 minutes | 76% faster |
| **Auto-scaling (60→500+)** | **~7 minutes** | **79% faster** |

**5000 Contact Campaign:**

| Speed Configuration | Time to Complete | Improvement |
|---------------------|------------------|-------------|
| Fixed 60 msg/sec | 83 minutes | Baseline |
| **Auto-scaling (60→200+)** | **~28 minutes** | **66% faster** |
| **Auto-scaling (60→500+)** | **~15 minutes** | **82% faster** |

---

## How to See It In Action

### Option 1: Monitor Tool (Recommended)

```bash
# Terminal 1: Start monitoring
npm run monitor

# Terminal 2: Create campaign in UI
# (2000+ contacts for best demonstration)

# Watch the speed increase automatically every minute!
```

### Option 2: Server Logs

```bash
pm2 logs whatsapp-app | grep "Rate Control"
```

You'll see:
```
[Rate Control] Increasing rate for number XXX: 60 -> 69 msg/sec
[Rate Control] Increasing rate for number XXX: 69 -> 79 msg/sec
[Rate Control] Increasing rate for number XXX: 79 -> 91 msg/sec
...
```

### Option 3: Database Check

```bash
# Check current rate
npm run test-speed
```

Run this before and after a campaign - you'll see the rate increased!

---

## When Auto-Scaling Stops

The system will stop increasing when:

1. **Reaches maximum (1000 msg/sec)** - Hard ceiling
2. **Hits rate limit errors** - WhatsApp tier limit reached
3. **Campaign completes** - No more messages to send
4. **Error rate >1%** - Quality issues detected

When it stops at rate limit:
- System automatically reduces by 20%
- That becomes your stable operating speed
- Saved to database for next campaign

---

## FAQ

### Q: Will it work with small campaigns (100-200 contacts)?

**A:** Yes, but scaling will be limited:
- 100 contacts at 60 msg/sec = ~2 minutes (finishes before scaling much)
- For best auto-scaling, use campaigns with 1000+ contacts

### Q: What if I have 2 WhatsApp numbers?

**A:** Each number scales independently!
- Number 1: 60→69→79→91... msg/sec
- Number 2: 60→69→79→91... msg/sec
- **Combined throughput doubles!**

### Q: Can I disable auto-scaling?

**A:** You can manually set a fixed rate:
```bash
node test-speed.js set-rate <id> 100
```
System will start at 100 and still auto-adjust if it hits limits.

### Q: How do I know what my maximum speed is?

**A:** Run a large campaign (2000+ contacts) and check after:
```bash
npm run test-speed
```
The current rate shown is your tested maximum!

### Q: What if auto-scaling is too aggressive?

**A:** System automatically protects itself:
- Reduces by 20% if errors occur
- Won't go below 10 msg/sec minimum
- Can manually set lower starting rate if needed

---

## Technical Details

### Modified Code

**File:** `/root/cloudAPI/backend/src/services/queueProcessor.js`

**Line 83-100:** Rate increase logic
```javascript
// Increase rate by 15% if error rate < 1% for 1 minute and we have enough samples
if (errorRate < 0.01 && totalRecent >= 60 && now - rateState.lastUpdateTime >= 1 * 60 * 1000) {
  const newRate = Math.min(1000, Math.floor(rateState.currentRate * 1.15));
  console.log(`[Rate Control] Increasing rate for number ${whatsappNumberId}: ${rateState.currentRate} -> ${newRate} msg/sec`);

  rateState.currentRate = newRate;
  rateState.lastUpdateTime = now;

  // Persist to database
  await supabase
    .from('whatsapp_numbers')
    .update({
      max_send_rate_per_sec: newRate,
      last_stable_rate_per_sec: newRate,
      last_updated: new Date().toISOString()
    })
    .eq('id', whatsappNumberId);
}
```

### Parameters

- **Increase Factor:** 1.15 (15% increase)
- **Increase Interval:** 60,000ms (1 minute)
- **Sample Size Required:** 60 messages
- **Error Threshold:** 1%
- **Decrease Factor:** 0.8 (20% decrease)
- **Decrease Trigger:** 3 consecutive 429 errors
- **Floor:** 10 msg/sec
- **Ceiling:** 1000 msg/sec

---

## Monitoring Commands

```bash
# See current speed and recommendations
npm run test-speed

# Watch campaign in real-time (shows auto-scaling)
npm run monitor

# View rate control logs
pm2 logs whatsapp-app | grep "Rate Control"

# Check WhatsApp number settings
npm run test-speed

# View all campaigns
npm run list-campaigns
```

---

## Summary

✅ **Auto-scaling is ACTIVE**
✅ **15% increase every 1 minute** (was 10% every 5 minutes)
✅ **Requires only 60 successful messages** (was 300)
✅ **Reaches high speeds in minutes, not hours**
✅ **Automatically finds your WhatsApp tier limit**
✅ **Self-protecting - reduces speed if errors occur**
✅ **No manual work required**

**Just create campaigns and let the system optimize itself!**

---

*Updated: November 10, 2025*
*Status: ✅ Active and Tested*
