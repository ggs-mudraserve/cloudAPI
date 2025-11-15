-- Migration: Sequential Template Processing + Spam Detection Auto-Pause
-- Created: 2025-01-15
-- Description:
--   1. Adds template ordering to enforce sequential first-attempt sends
--   2. Adds spam detection tracking to auto-pause campaigns on error 131048

-- ============================================================
-- PART 1: Sequential Template Processing
-- ============================================================

-- Add current_template_index to campaigns table
-- Tracks which template is currently in "first-attempt" sending phase
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS current_template_index INTEGER DEFAULT 0;

-- Add template_order to send_queue table
-- Set during enqueue based on template position in template_names array
ALTER TABLE send_queue
ADD COLUMN IF NOT EXISTS template_order INTEGER DEFAULT 0;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_send_queue_template_order_retry
ON send_queue(campaign_id, template_order, retry_count, status)
WHERE status = 'ready';

-- Backfill template_order for any existing messages in queue
UPDATE send_queue sq
SET template_order = (
  SELECT COALESCE(array_position(c.template_names, sq.template_name), 1) - 1
  FROM campaigns c
  WHERE c.id = sq.campaign_id
)
WHERE template_order = 0 AND template_name IS NOT NULL;

-- ============================================================
-- PART 2: Spam Detection & Auto-Pause
-- ============================================================

-- Add spam tracking columns to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS spam_pause_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS spam_paused_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Add spam error tracking to send_queue table
ALTER TABLE send_queue
ADD COLUMN IF NOT EXISTS spam_error_detected BOOLEAN DEFAULT FALSE;

-- Create index for spam error counting
CREATE INDEX IF NOT EXISTS idx_send_queue_spam_errors
ON send_queue(campaign_id, spam_error_detected, updated_at)
WHERE spam_error_detected = TRUE;

-- ============================================================
-- PART 3: Database Functions
-- ============================================================

-- Function to count recent spam errors for a campaign
CREATE OR REPLACE FUNCTION count_recent_spam_errors(
  p_campaign_id UUID,
  p_minutes_ago INTEGER DEFAULT 10
)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM send_queue
    WHERE campaign_id = p_campaign_id
      AND spam_error_detected = TRUE
      AND updated_at >= NOW() - (p_minutes_ago || ' minutes')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql;

-- Function to reset campaign spam tracking (for manual resume)
CREATE OR REPLACE FUNCTION reset_campaign_spam_tracking(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE campaigns
  SET
    spam_pause_count = 0,
    spam_paused_until = NULL,
    pause_reason = NULL
  WHERE id = p_campaign_id;

  -- Also reset spam flags in send_queue
  UPDATE send_queue
  SET spam_error_detected = FALSE
  WHERE campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 4: Comments for Documentation
-- ============================================================

COMMENT ON COLUMN campaigns.current_template_index IS
'Index of template currently in first-attempt phase (0-based). Used for sequential template processing.';

COMMENT ON COLUMN campaigns.spam_pause_count IS
'Number of times campaign has been auto-paused due to spam errors. 0=never paused, 1=paused once (auto-resume), 2+=permanently paused';

COMMENT ON COLUMN campaigns.spam_paused_until IS
'Timestamp when campaign should auto-resume after spam pause. NULL if permanently paused or not paused.';

COMMENT ON COLUMN campaigns.pause_reason IS
'Human-readable reason for campaign pause. Displayed in UI.';

COMMENT ON COLUMN send_queue.template_order IS
'Order of template in campaign.template_names array (0-based). Used to enforce sequential sending.';

COMMENT ON COLUMN send_queue.spam_error_detected IS
'TRUE if this message received error 131048 (Spam Rate limit hit). Used for counting spam errors.';

-- ============================================================
-- VERIFICATION QUERIES (run after migration to verify)
-- ============================================================

-- Verify new columns exist
-- SELECT
--   column_name,
--   data_type,
--   column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('campaigns', 'send_queue')
--   AND column_name IN ('current_template_index', 'template_order', 'spam_pause_count', 'spam_paused_until', 'pause_reason', 'spam_error_detected')
-- ORDER BY table_name, column_name;

-- Verify indexes exist
-- SELECT
--   tablename,
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE indexname IN ('idx_send_queue_template_order_retry', 'idx_send_queue_spam_errors');
