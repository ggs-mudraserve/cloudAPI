# Campaign Duplicate Message Fix - November 18, 2025

## Issue Summary

Campaign `4d46271f-f3b4-4f5b-a2c7-6dbad447a845` had critical bugs causing:
1. Users receiving the same message 2-10 times (duplicate sends)
2. Campaign counters inflated 3-8x (46,262 sent + 119,218 failed for only 20,028 contacts)
3. View Details stats not matching campaign dashboard stats

## Root Causes

### Issue #1: Queue Entries Sent Multiple Times
- **Problem:** Queue entries marked as `processing` could be reprocessed after PM2 restarts or race conditions
- **Evidence:** User `919741771659` had 1 queue entry but received 10 messages with unique WAMIDs
- **Impact:** 20,028 contacts received 165,480 total message attempts (8.26x duplication)

### Issue #2: Counter Inflation
- **Problem:** Counters incremented for every send attempt, not per unique contact
- **Impact:** Campaign stats showed 46,262 sent when only ~20,000 unique contacts

### Issue #3: Stats Mismatch
- **Problem:** Campaign counters counted from messages table (all attempts), View Details from send_queue (unique contacts)
- **Impact:** Confusing UX with mismatched numbers

## Fixes Applied

### Fix #1: Idempotency Check (File: `src/services/queueProcessor.js`)
**Lines 484-501:** Added check for already-sent messages before sending
```javascript
// Verify message wasn't already sent
const { data: currentEntry } = await supabase
  .from('send_queue')
  .select('whatsapp_message_id, status')
  .eq('id', message.id)
  .single();

if (currentEntry.whatsapp_message_id) {
  // Skip - already sent
  return { success: true, skipped: true, ... };
}
```

**Lines 535-543:** Immediately store WAMID after successful send
```javascript
// Store WAMID immediately to prevent duplicate sends
await supabase
  .from('send_queue')
  .update({
    whatsapp_message_id: result.messageId,
    actual_sent_at: new Date().toISOString()
  })
  .eq('id', message.id);
```

### Fix #2: Reset Stuck Processing Entries (File: `src/services/queueProcessor.js`)
**Lines 389-405:** Reset entries stuck in `processing` state (from crashes) back to `ready`
```javascript
// Reset stuck 'processing' entries (> 10 min old, no WAMID)
await supabase
  .from('send_queue')
  .update({ status: 'ready' })
  .eq('campaign_id', campaignId)
  .eq('status', 'processing')
  .is('whatsapp_message_id', null)
  .lt('updated_at', stuckCutoff)
  .select('id');
```

### Fix #3: Accurate Counter Calculation (File: `src/services/queueProcessor.js`)
**Lines 81-107:** Changed `flushCounterCache` to calculate from send_queue status instead of incremental cache
```javascript
// Calculate accurate counts from send_queue
const { data: queueStats } = await supabase
  .from('send_queue')
  .select('status')
  .eq('campaign_id', campaignId);

const sentCount = queueStats.filter(q => q.status === 'sent').length;
const failedCount = queueStats.filter(q => q.status === 'failed').length;

await supabase
  .from('campaigns')
  .update({ total_sent: sentCount, total_failed: failedCount })
  .eq('id', campaignId);
```

### Fix #4: Database Migration
**File:** `migrations/007_add_send_queue_idempotency.sql`

Added columns to send_queue:
- `whatsapp_message_id` TEXT - Stores WAMID for idempotency
- `actual_sent_at` TIMESTAMPTZ - Tracks when actually sent

Added indexes:
- `idx_send_queue_wamid` - Unique index on WAMID (prevents duplicate sends)
- `idx_send_queue_stuck_processing` - Fast lookup for stuck entries

## Testing Performed

✅ Migration applied successfully to local Supabase
✅ Code changes deployed to `src/services/queueProcessor.js`
✅ Verified logic with code review

## Expected Behavior After Fix

1. **No Duplicate Sends:**
   - Each contact receives exactly 1 message per template
   - If PM2 restarts mid-campaign, messages aren't re-sent
   - Stuck `processing` entries automatically reset after 10 minutes

2. **Accurate Counters:**
   - `total_sent` = unique contacts successfully sent
   - `total_failed` = unique contacts that failed
   - Campaign stats match View Details stats

3. **Better Logging:**
   - Skipped messages logged: "Skipping already-sent message {id} (WAMID: ...)"
   - Stuck entries logged: "Reset N stuck 'processing' entries to 'ready'"
   - Batch logs show: "X sent, Y failed, Z skipped (already sent)"

## Next Steps

1. ✅ Apply migration
2. ✅ Deploy code changes
3. ⏳ Restart PM2 processes
4. ⏳ Test with small campaign (100-500 contacts)
5. ⏳ Monitor logs for skipped messages
6. ⏳ Verify campaign counters match expectations

## Files Modified

- `/root/cloudAPI/backend/migrations/007_add_send_queue_idempotency.sql` (NEW)
- `/root/cloudAPI/backend/src/services/queueProcessor.js` (MODIFIED)

## Database Changes

```sql
-- Columns added to send_queue
ALTER TABLE send_queue
ADD COLUMN whatsapp_message_id TEXT,
ADD COLUMN actual_sent_at TIMESTAMPTZ;

-- Indexes created
CREATE UNIQUE INDEX idx_send_queue_wamid
ON send_queue(whatsapp_message_id)
WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX idx_send_queue_stuck_processing
ON send_queue(campaign_id, status, updated_at)
WHERE status = 'processing';
```

## Rollback Plan

If issues occur:
1. Revert `queueProcessor.js` from git: `git checkout HEAD~1 src/services/queueProcessor.js`
2. Restart PM2: `pm2 restart whatsapp-app`
3. Database columns can stay (won't cause issues if unused)

## Author

Fixed by: Claude Code
Date: November 18, 2025
Campaign ID: 4d46271f-f3b4-4f5b-a2c7-6dbad447a845
