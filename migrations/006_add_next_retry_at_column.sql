-- Migration: Add next_retry_at column to send_queue
-- Created: 2025-11-06
-- Description: Add next_retry_at timestamp for retry scheduling

ALTER TABLE send_queue
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- Add index for efficient retry queries
CREATE INDEX IF NOT EXISTS idx_send_queue_next_retry
ON send_queue(next_retry_at)
WHERE status = 'ready' AND next_retry_at IS NOT NULL;
