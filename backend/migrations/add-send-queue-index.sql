-- Migration: Add index for send_queue campaign processing
-- This index optimizes the main queue polling query which was causing statement timeouts
-- Query: SELECT * FROM send_queue WHERE campaign_id = X AND status = 'ready' ORDER BY created_at LIMIT 100

CREATE INDEX IF NOT EXISTS idx_send_queue_campaign_status_created
ON send_queue(campaign_id, status, created_at)
WHERE status IN ('ready', 'processing');

-- This is a partial index that only includes rows with status 'ready' or 'processing'
-- It will dramatically speed up the queue polling query and prevent statement timeouts

COMMENT ON INDEX idx_send_queue_campaign_status_created IS
'Optimizes queue polling query: WHERE campaign_id = X AND status = ready ORDER BY created_at';
