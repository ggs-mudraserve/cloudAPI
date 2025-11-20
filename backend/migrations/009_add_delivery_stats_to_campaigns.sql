-- Migration: Add delivery statistics to campaigns table
-- Date: November 18, 2025
-- Purpose: Store delivered/read/replied counts for realtime updates

-- Add new columns to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS total_delivered INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_read INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_replied INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN campaigns.total_delivered IS 'Count of messages delivered (delivered + read status)';
COMMENT ON COLUMN campaigns.total_read IS 'Count of messages read by recipient';
COMMENT ON COLUMN campaigns.total_replied IS 'Count of unique users who replied to campaign messages';

-- Update existing campaigns with current stats (optional - can be done by app)
-- Note: This is a one-time backfill, future updates handled by queue processor
DO $$
DECLARE
  campaign_record RECORD;
  delivered_count INTEGER;
  read_count INTEGER;
  replied_count INTEGER;
BEGIN
  FOR campaign_record IN SELECT id FROM campaigns LOOP
    -- Count delivered messages (status = 'delivered' OR 'read')
    SELECT COUNT(DISTINCT msl.whatsapp_message_id)
    INTO delivered_count
    FROM message_status_logs msl
    WHERE msl.campaign_id = campaign_record.id
      AND msl.status IN ('delivered', 'read');

    -- Count read messages (status = 'read')
    SELECT COUNT(DISTINCT msl.whatsapp_message_id)
    INTO read_count
    FROM message_status_logs msl
    WHERE msl.campaign_id = campaign_record.id
      AND msl.status = 'read';

    -- Count replied users (unique user_phone who sent incoming messages)
    SELECT COUNT(DISTINCT m_out.user_phone)
    INTO replied_count
    FROM messages m_out
    WHERE m_out.campaign_id = campaign_record.id
      AND m_out.direction = 'outgoing'
      AND EXISTS (
        SELECT 1 FROM messages m_in
        WHERE m_in.user_phone = m_out.user_phone
          AND m_in.whatsapp_number_id = m_out.whatsapp_number_id
          AND m_in.direction = 'incoming'
      );

    -- Update campaign
    UPDATE campaigns
    SET total_delivered = COALESCE(delivered_count, 0),
        total_read = COALESCE(read_count, 0),
        total_replied = COALESCE(replied_count, 0)
    WHERE id = campaign_record.id;
  END LOOP;
END $$;
