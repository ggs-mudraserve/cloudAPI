-- Migration: Add idempotency tracking to send_queue table
-- Purpose: Prevent duplicate message sends by tracking WhatsApp Message IDs
-- Date: 2025-11-18

-- Add columns to track actual send status
ALTER TABLE send_queue
ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
ADD COLUMN IF NOT EXISTS actual_sent_at TIMESTAMPTZ;

-- Add index for fast WAMID lookups (prevents duplicate sends)
CREATE UNIQUE INDEX IF NOT EXISTS idx_send_queue_wamid
ON send_queue(whatsapp_message_id)
WHERE whatsapp_message_id IS NOT NULL;

-- Add index for finding stuck processing entries
CREATE INDEX IF NOT EXISTS idx_send_queue_stuck_processing
ON send_queue(campaign_id, status, updated_at)
WHERE status = 'processing';

-- Add comment for documentation
COMMENT ON COLUMN send_queue.whatsapp_message_id IS 'WhatsApp Message ID (WAMID) returned from API - used for idempotency';
COMMENT ON COLUMN send_queue.actual_sent_at IS 'Timestamp when message was actually sent to WhatsApp API (vs sent_at which is queue status update time)';
