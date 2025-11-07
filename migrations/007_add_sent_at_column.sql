-- Migration: Add sent_at and whatsapp_message_id columns to send_queue
-- Created: 2025-11-06
-- Description: Track when messages were sent and their WhatsApp message IDs

ALTER TABLE send_queue
ADD COLUMN IF NOT EXISTS sent_at timestamptz,
ADD COLUMN IF NOT EXISTS whatsapp_message_id text;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_send_queue_sent_at
ON send_queue(sent_at)
WHERE sent_at IS NOT NULL;
