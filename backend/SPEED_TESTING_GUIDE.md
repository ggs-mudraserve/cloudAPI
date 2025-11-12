# Message Sending Speed Testing & Optimization Guide

## Current Performance Baseline

**After Recent Optimizations:**
- ✅ Initial Rate: 60 messages/second
- ✅ Maximum Rate: 1,000 messages/second (adaptive ceiling)
- ✅ Minimum Rate: 10 messages/second (floor for rate limiting)
- ✅ Template Caching: Eliminates N+1 query problem
- ✅ Parallel Processing: Messages sent concurrently
- ✅ Queue Polling: 100ms interval (fast mode)

---

## Speed Testing Methodology

### Phase 1: Baseline Testing (Current Speed Validation)

#### Test 1: Small Campaign (100 contacts)
**Purpose:** Verify system works correctly at current speeds

```bash
# 1. Start monitoring
npm run monitor

# 2. Create test campaign with 100 contacts
# Via UI or API

# 3. Observe metrics:
# - Messages/second (should be ~60)
# - Success rate (should be >99%)
# - API errors (should be zero or minimal)
```

**Success Criteria:**
- ✅ Speed: 55-65 msg/sec
- ✅ Success rate: >99%
- ✅ No 429 errors (rate limiting)
- ✅ Delivery rate: >95%

#### Test 2: Medium Campaign (500 contacts)
**Purpose:** Test sustained performance

```bash
# Monitor for 8-10 minutes
# Expected completion time: ~8.3 seconds at 60 msg/sec
```

**Success Criteria:**
- ✅ Consistent speed throughout campaign
- ✅ No rate degradation over time
- ✅ Memory usage stable (<200MB)
- ✅ CPU usage reasonable (<50%)

#### Test 3: Large Campaign (2000+ contacts)
**Purpose:** Test at scale

```bash
# Expected completion time: ~33 seconds at 60 msg/sec
```

**Success Criteria:**
- ✅ Speed maintains throughout
- ✅ Rate control adjusts if needed
- ✅ No server crashes or memory leaks

---

### Phase 2: Speed Increase Testing

## Strategy 1: Gradual Rate Increase (RECOMMENDED)

WhatsApp Cloud API has tier-based limits. We need to find your tier limit.

### Step 1: Manual Rate Increase

```sql
-- Check current rate for your WhatsApp number
SELECT id, display_name, max_send_rate_per_sec, messaging_tier
FROM whatsapp_numbers;

-- Increase rate to 100 msg/sec
UPDATE whatsapp_numbers
SET max_send_rate_per_sec = 100,
    last_stable_rate_per_sec = 100
WHERE id = 'YOUR_WHATSAPP_NUMBER_ID';
```

### Step 2: Test at New Rate

```bash
# Start small test campaign (200 contacts)
npm run monitor

# Watch for:
# - Actual speed achieved
# - Any 429 errors (rate limit)
# - Error code 130429 (WhatsApp rate limit)
```

### Step 3: Interpret Results

**Scenario A: Success (No errors)**
```
✅ Speed: 95-105 msg/sec
✅ No 429 errors
✅ Success rate: >99%

ACTION: Increase rate further
```

**Scenario B: Rate Limited (429 errors)**
```
❌ Speed: Fluctuating 60-100 msg/sec
❌ Error code 130429 appearing
❌ System auto-reduces to 80 msg/sec

ACTION: Current rate (100) exceeds your tier limit
Your safe speed is around 80 msg/sec
```

**Scenario C: Other Errors**
```
❌ API errors but not 429
❌ Connection timeouts

ACTION: Issue is not rate limit, check:
- Network connectivity
- API token validity
- Server resources
```

### Step 4: Find Your Maximum Speed

Repeat steps 1-3 with incremental increases:

| Test # | Rate (msg/sec) | Expected Tier |
|--------|----------------|---------------|
| 1      | 60             | Tier 1 (Standard) |
| 2      | 80             | Tier 1-2 |
| 3      | 100            | Tier 2 |
| 4      | 250            | Tier 2-3 |
| 5      | 500            | Tier 3 |
| 6      | 1000           | Tier 4 (Unlimited) |

**Stop when you hit 429 errors consistently!**

---

## Strategy 2: Automatic Adaptive Increase ⚡ (ACTIVE - FAST MODE)

The system automatically increases speed by **15% every 1 minute** if:
- Error rate < 1%
- At least 60 successful messages in last minute
- No recent rate adjustments

**This is ALREADY ENABLED and OPTIMIZED for fast scaling!**

**Auto-Scaling Timeline:**
```
Start:     60 msg/sec
1 minute:  69 msg/sec  (+15%)
2 minutes: 79 msg/sec  (+15%)
3 minutes: 91 msg/sec  (+15%)
4 minutes: 105 msg/sec (+15%)
5 minutes: 121 msg/sec (+15%)
6 minutes: 139 msg/sec (+15%)
7 minutes: 160 msg/sec (+15%)
8 minutes: 184 msg/sec (+15%)
9 minutes: 212 msg/sec (+15%)
10 minutes: 244 msg/sec (+15%)
```

**Just run a large campaign (2000+ contacts) and watch it automatically scale up!**

**What Happens:**
1. Campaign starts at 60 msg/sec
2. Every minute with no errors → increases by 15%
3. Continues until it hits rate limits or reaches 1000 msg/sec max
4. If rate limit hit → automatically reduces by 20%
5. Finds your optimal speed automatically!

---

## Strategy 3: Parallel WhatsApp Numbers

If you have multiple WhatsApp numbers, campaigns run in PARALLEL.

**Current Setup:**
- 1 WhatsApp number: 60 msg/sec
- 2 WhatsApp numbers: 120 msg/sec (60 each)
- 3 WhatsApp numbers: 180 msg/sec (60 each)

**Test Setup:**
```bash
# Add another WhatsApp number via UI
# Create two campaigns simultaneously on different numbers
# Monitor both
```

**Expected Result:**
Combined throughput = (Number of WhatsApp Numbers) × (Rate per Number)

---

## Strategy 4: Optimize Batch Size

Currently processes messages in batches. Larger batches = more parallel execution.

**Check Current Batch Size:**
```bash
grep -n "limit(10)" backend/src/services/queueProcessor.js
```

**Increase Batch Size:**
```javascript
// Edit: /root/cloudAPI/backend/src/services/queueProcessor.js
// Around line 265

// BEFORE:
.limit(10);

// AFTER (More Aggressive):
.limit(50);  // Process 50 messages at once
```

**Trade-offs:**
- ✅ Higher throughput (more parallel requests)
- ⚠️ Higher memory usage
- ⚠️ Risk of overwhelming WhatsApp API

**Recommended:** Start with 20, test, then try 50.

---

## Monitoring During Speed Tests

### Real-Time Monitoring

```bash
# Terminal 1: Campaign monitor
cd /root/cloudAPI/backend
npm run monitor

# Terminal 2: Server logs
pm2 logs whatsapp-app --lines 100

# Terminal 3: System resources
pm2 monit
```

### Key Metrics to Track

```bash
# Check rate control status
echo "SELECT id, display_name, max_send_rate_per_sec, last_stable_rate_per_sec, messaging_tier
FROM whatsapp_numbers;" | psql $DATABASE_URL

# Check for rate limit errors
echo "SELECT COUNT(*) as rate_limit_errors
FROM send_queue
WHERE error_details LIKE '%130429%'
AND created_at > NOW() - INTERVAL '1 hour';" | psql $DATABASE_URL

# Check campaign speed
echo "SELECT
  campaign_id,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'processing') as processing
FROM send_queue
WHERE campaign_id = 'YOUR_CAMPAIGN_ID'
GROUP BY campaign_id;" | psql $DATABASE_URL
```

### Dashboard Monitoring (Create Quick Script)

```bash
# Create: monitor-speed.sh
cat > monitor-speed.sh << 'EOF'
#!/bin/bash
while true; do
  clear
  echo "=== Message Sending Speed Monitor ==="
  echo "Time: $(date)"
  echo ""

  # Get current rate
  echo "Current Rate Settings:"
  psql $DATABASE_URL -c "SELECT display_name, max_send_rate_per_sec, messaging_tier FROM whatsapp_numbers;"

  echo ""
  echo "Active Campaigns:"
  psql $DATABASE_URL -c "SELECT id, name, status, total_sent, total_contacts FROM campaigns WHERE status IN ('running', 'scheduled') ORDER BY created_at DESC LIMIT 5;"

  echo ""
  echo "Recent Errors (last 5 min):"
  psql $DATABASE_URL -c "SELECT error_details, COUNT(*) FROM send_queue WHERE status = 'failed' AND created_at > NOW() - INTERVAL '5 minutes' GROUP BY error_details LIMIT 5;"

  sleep 5
done
EOF

chmod +x monitor-speed.sh
./monitor-speed.sh
```

---

## Troubleshooting Speed Issues

### Issue 1: Speed Lower Than Expected

**Symptoms:**
- Dashboard shows 60 msg/sec rate
- Actual speed is 20-30 msg/sec

**Diagnosis:**
```bash
# Check if queue processor is running
pm2 list | grep whatsapp

# Check queue processor interval
pm2 logs whatsapp-app | grep "Queue"

# Check for stuck messages
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM send_queue WHERE campaign_id = 'YOUR_CAMPAIGN_ID' GROUP BY status;"
```

**Solutions:**
```bash
# 1. Restart queue processor
pm2 restart whatsapp-app

# 2. Check database connection
pm2 logs whatsapp-app | grep -i "error\|connection"

# 3. Clear stuck messages
node /root/cloudAPI/backend/fix-stuck-messages.js
```

### Issue 2: Speed Starts High, Then Drops

**Symptoms:**
- Starts at 60 msg/sec
- Drops to 10-20 msg/sec after few minutes
- System logs show rate decrease

**Diagnosis:**
```bash
# Check for 429 errors
pm2 logs whatsapp-app | grep "130429"

# Check rate control logs
pm2 logs whatsapp-app | grep "Rate Control"
```

**Solution:**
- You've hit WhatsApp's rate limit
- Current rate is too high for your tier
- System automatically reduced rate
- **Action:** Accept the reduced rate or upgrade WhatsApp tier

### Issue 3: Inconsistent Speed (Fluctuating)

**Symptoms:**
- Speed varies between 20-60 msg/sec
- No clear pattern

**Diagnosis:**
```bash
# Check server CPU/Memory
pm2 monit

# Check database response time
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM send_queue WHERE status = 'ready' LIMIT 10;"

# Check network latency to WhatsApp API
curl -w "@curl-format.txt" -o /dev/null -s https://graph.facebook.com/v21.0/
```

**Solutions:**
- Upgrade server resources (if CPU >80% or Memory >90%)
- Optimize database queries (add indexes)
- Check network stability

---

## Speed Optimization Checklist

### Level 1: Quick Wins (Already Done ✅)
- [x] Template caching
- [x] Parallel message processing
- [x] Reduced queue processor interval
- [x] Adaptive rate control

### Level 2: Configuration Tuning (Recommended Next)
- [ ] Increase batch size from 10 to 20-50
- [ ] Reduce adaptive scaling wait time from 5min to 2min
- [ ] Manually set rate higher (if tier supports)
- [ ] Add more WhatsApp numbers for parallel execution

### Level 3: Advanced Optimization (If Needed)
- [ ] Implement message pre-validation
- [ ] Add connection pooling to WhatsApp API
- [ ] Implement request batching (if API supports)
- [ ] Use Redis for queue instead of PostgreSQL
- [ ] Horizontal scaling (multiple server instances)

### Level 4: Infrastructure Upgrades
- [ ] Upgrade WhatsApp Business Tier
- [ ] Upgrade server (more CPU/RAM)
- [ ] Use CDN for media files
- [ ] Database read replicas
- [ ] Load balancer for multiple servers

---

## Expected Speed by Configuration

| Configuration | Expected Speed | Notes |
|---------------|----------------|-------|
| **Current (Baseline)** | 60 msg/sec | Tier 1, single number |
| **Batch size 50** | 80-100 msg/sec | If tier allows |
| **Rate set to 100** | 100 msg/sec | Tier 2 required |
| **Rate set to 250** | 250 msg/sec | Tier 3 required |
| **2 WhatsApp numbers** | 120 msg/sec | 60 each, parallel |
| **3 WhatsApp numbers** | 180 msg/sec | 60 each, parallel |
| **Tier 4 + optimizations** | 1000+ msg/sec | Maximum possible |

---

## Testing Schedule (Recommended)

### Week 1: Baseline Validation
- Day 1: Test 100 contacts
- Day 2: Test 500 contacts
- Day 3: Test 2000 contacts
- Day 4-5: Analyze results

### Week 2: Gradual Increase
- Day 1: Increase to 80 msg/sec, test
- Day 2: Increase to 100 msg/sec, test
- Day 3: Increase to 150 msg/sec, test
- Day 4: Find maximum stable rate
- Day 5: Set optimal rate, full-scale test

### Week 3: Optimization
- Day 1: Optimize batch size
- Day 2: Test with larger batches
- Day 3: Fine-tune adaptive scaling
- Day 4-5: Production testing

---

## Success Metrics

**Good Performance:**
- ✅ Consistent speed (±10% variation)
- ✅ Success rate >99%
- ✅ Zero or minimal 429 errors
- ✅ Delivery rate >95%
- ✅ Server CPU <60%
- ✅ Server Memory <70%

**Excellent Performance:**
- 🏆 Speed >100 msg/sec
- 🏆 Success rate >99.5%
- 🏆 Zero 429 errors
- 🏆 Delivery rate >97%
- 🏆 Automatic rate increases working
- 🏆 System stable under load

---

## Quick Start: Speed Test Right Now

```bash
# 1. Check current configuration
cd /root/cloudAPI/backend
node -e "
const { supabase } = require('./src/config/supabase');
(async () => {
  const { data } = await supabase
    .from('whatsapp_numbers')
    .select('display_name, max_send_rate_per_sec, messaging_tier');
  console.table(data);
})();
"

# 2. Start monitoring
npm run monitor &

# 3. Create test campaign via UI
# - Upload CSV with 500 contacts
# - Select template
# - Start immediately

# 4. Watch real-time metrics in monitor
# 5. Check results after completion

# 6. If speed is good and no errors, increase rate:
# UPDATE whatsapp_numbers SET max_send_rate_per_sec = 80;
# Repeat test

# 7. Keep increasing until you hit rate limits
# That's your maximum speed!
```

---

## Need Help?

**Check logs:**
```bash
pm2 logs whatsapp-app --lines 100
```

**Check database:**
```bash
npm run list-campaigns
```

**Monitor system:**
```bash
pm2 monit
```

**Contact:** Check error logs and share error codes for diagnosis

---

**Document Version:** 1.0
**Last Updated:** November 10, 2025
**Status:** Ready for Testing
