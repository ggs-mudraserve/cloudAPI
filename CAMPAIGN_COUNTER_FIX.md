# Campaign Counter & Auto-Completion Fix

**Date:** November 13, 2025
**Status:** ✅ Fixed and Verified

---

## Issues Found

### Issue 1: Dashboard showing Sent/Failed as 0/0
- **Problem:** `campaigns.total_sent` and `campaigns.total_failed` columns were not being updated
- **Symptom:** Dashboard displayed "Sent/Failed: 0/0" even though messages were being sent successfully
- **Root Cause:** Backend code calls `increment_campaign_sent()` and `increment_campaign_failed()` database functions, but these functions were missing from the local Supabase database (they were not included in the schema migration)

### Issue 2: Campaign not auto-completing
- **Problem:** Campaign "FIN NEW DATA 10 NOV 2025 FILE 31" remained in "running" status even after all messages were processed
- **Symptom:** 10,521/10,549 messages sent (99.7%), but status stuck at "running"
- **Root Cause:** Auto-completion logic checks if `(total_sent + total_failed) >= total_contacts`, but since these counters were stuck at 0, the condition was never met

---

## Root Cause Analysis

**Missing Database Functions:**

The backend code in `queueProcessor.js` calls two database functions:
- Line 192: `supabase.rpc('increment_campaign_sent', { _campaign_id: message.campaign_id })`
- Line 239: `supabase.rpc('increment_campaign_failed', { _campaign_id: message.campaign_id })`

These functions were missing from the local database schema, causing silent failures (no errors thrown, just no updates).

---

## Solution Implemented

### 1. Created Missing Database Functions

```sql
-- Function to increment sent count
CREATE OR REPLACE FUNCTION increment_campaign_sent(_campaign_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET total_sent = total_sent + 1
  WHERE id = _campaign_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment failed count
CREATE OR REPLACE FUNCTION increment_campaign_failed(_campaign_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET total_failed = total_failed + 1
  WHERE id = _campaign_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION increment_campaign_sent(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_campaign_failed(uuid) TO anon, authenticated, service_role;
```

### 2. Fixed Existing Campaign Data

Recalculated correct counts from the `send_queue` table:

```sql
UPDATE campaigns c
SET
  total_sent = (SELECT COUNT(*) FROM send_queue WHERE campaign_id = c.id AND status = 'sent'),
  total_failed = (SELECT COUNT(*) FROM send_queue WHERE campaign_id = c.id AND status = 'failed');
```

**Results:**
- Campaign FILE 31: Updated to 10,521 sent / 28 failed (was 0/0)
- Campaign FILE 32: Updated to 24,181 sent / 84 failed (was 0/0)

### 3. Updated Schema File

Added the missing functions to `/root/cloudAPI/complete_schema.sql` to prevent this issue in future installations.

**Schema now includes:**
- Total Functions: 5 (was 3)
  - `upsert_template()`
  - `detect_template_category_change()`
  - `refresh_daily_summary()`
  - ✅ **`increment_campaign_sent()`** (NEW)
  - ✅ **`increment_campaign_failed()`** (NEW)

---

## Verification Results

### Before Fix:
```
Campaign FILE 31: Sent/Failed: 0/0 (actual: 10,521/28)
Campaign FILE 32: Sent/Failed: 0/0 (actual: 23,530/84)
```

### After Fix:
```
Campaign FILE 31: Sent/Failed: 10,521/28 ✅ (status: completed)
Campaign FILE 32: Sent/Failed: 24,363/84 ✅ (status: running, 78.2% progress)
```

### Real-Time Counter Test:
- **Time T+0:** 24,181 sent
- **Time T+10s:** 24,363 sent
- **Messages sent:** 182 in 10 seconds (~18 msg/sec)
- **Progress:** 77.6% → 78.2%
- **Verdict:** ✅ Counters updating in real-time

---

## How Auto-Completion Works

The queue processor checks completion in two scenarios:

### Scenario 1: No messages to process
```javascript
// Check if all messages are processed
const { count: pendingCount } = await supabase
  .from('send_queue')
  .select('status', { count: 'exact' })
  .eq('campaign_id', campaignId)
  .in('status', ['ready', 'processing']);

if (pendingCount === 0) {
  // Verify counts match
  const processedCount = total_sent + total_failed;

  if (processedCount >= total_contacts) {
    // Mark as completed
    await supabase.from('campaigns').update({
      status: 'completed',
      end_time: NOW()
    });
  }
}
```

### Scenario 2: After processing batch
Same logic runs after each batch of messages is processed.

---

## Expected Behavior Going Forward

### For Running Campaigns:
1. ✅ Each sent message increments `campaigns.total_sent` by 1
2. ✅ Each failed message increments `campaigns.total_failed` by 1
3. ✅ Dashboard displays real-time progress
4. ✅ When all messages processed → campaign auto-marks as "completed"

### For New Campaigns:
1. ✅ Counters start at 0
2. ✅ Increment correctly as messages are sent/failed
3. ✅ Auto-complete when `(total_sent + total_failed) >= total_contacts`

---

## Files Modified

1. **Database:** Added 2 functions
   - `increment_campaign_sent()`
   - `increment_campaign_failed()`

2. **Schema File:** `/root/cloudAPI/complete_schema.sql`
   - Added function definitions (lines 288-310)
   - Updated summary (line 332)

3. **No Backend Code Changes:** Code was already correct, just missing database functions

---

## Testing Recommendations

1. **Monitor Campaign FILE 32** until completion
   - Currently at 78.2% (24,363/31,265)
   - Should auto-complete when all messages processed
   - Verify status changes to "completed" automatically

2. **Create New Test Campaign**
   - Start with small batch (~100 contacts)
   - Verify counters increment from 0
   - Verify auto-completion when done

3. **Dashboard Verification**
   - Refresh dashboard to see updated counts
   - Verify progress bars show correct percentages
   - Verify FILE 31 shows as "completed"

---

## Known Expected Behaviors

### Failed Messages (~0.2-0.3% rate)
- Some messages will fail due to invalid receiving numbers
- This is **normal and expected**
- WhatsApp API error codes:
  - `#135000` - Generic user error (invalid number, blocked, etc.)
  - Other codes - Network issues, rate limits, etc.

### Campaign FILE 32 Current Status
- **Total:** 31,265 contacts
- **Sent:** 24,363+ (78.2%+)
- **Failed:** 84 (0.27% failure rate - normal)
- **Pending:** 6,815 (decreasing)
- **Status:** Running (will auto-complete)
- **Rate:** ~18 msg/sec (controlled by adaptive rate limiter)

---

## Prevention for Future

✅ The complete schema file now includes all 5 required functions
✅ Future installations will have these functions from the start
✅ No code changes needed - backend was already correct

---

**Document Version:** 1.0
**Fix Applied:** November 13, 2025, 10:25 UTC
**Status:** ✅ Resolved and Verified
