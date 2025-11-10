-- Fix foreign key constraint on message_status_logs to allow cascade deletion
-- This allows deleting WhatsApp numbers without manually cleaning up status logs first

-- Drop the existing foreign key constraint
ALTER TABLE message_status_logs
DROP CONSTRAINT IF EXISTS message_status_logs_whatsapp_number_id_fkey;

-- Recreate the constraint with ON DELETE CASCADE
ALTER TABLE message_status_logs
ADD CONSTRAINT message_status_logs_whatsapp_number_id_fkey
FOREIGN KEY (whatsapp_number_id)
REFERENCES whatsapp_numbers(id)
ON DELETE CASCADE;

-- Also fix campaign_id constraint if needed
ALTER TABLE message_status_logs
DROP CONSTRAINT IF EXISTS message_status_logs_campaign_id_fkey;

ALTER TABLE message_status_logs
ADD CONSTRAINT message_status_logs_campaign_id_fkey
FOREIGN KEY (campaign_id)
REFERENCES campaigns(id)
ON DELETE CASCADE;
