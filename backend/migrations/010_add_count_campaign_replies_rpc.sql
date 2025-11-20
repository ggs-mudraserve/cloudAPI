-- Migration: Add RPC function to count campaign replies
-- Date: November 18, 2025
-- Purpose: Fast counting of unique users who replied to campaign

-- Drop function if exists
DROP FUNCTION IF EXISTS count_campaign_replies(UUID);

-- Create function to count unique repliers
CREATE OR REPLACE FUNCTION count_campaign_replies(p_campaign_id UUID)
RETURNS INTEGER AS $$
DECLARE
  reply_count INTEGER;
BEGIN
  -- Count unique users who sent incoming messages after receiving campaign message
  SELECT COUNT(DISTINCT m_out.user_phone)
  INTO reply_count
  FROM messages m_out
  WHERE m_out.campaign_id = p_campaign_id
    AND m_out.direction = 'outgoing'
    AND EXISTS (
      SELECT 1 FROM messages m_in
      WHERE m_in.user_phone = m_out.user_phone
        AND m_in.whatsapp_number_id = m_out.whatsapp_number_id
        AND m_in.direction = 'incoming'
    );

  RETURN COALESCE(reply_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION count_campaign_replies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION count_campaign_replies(UUID) TO service_role;

-- Add comment
COMMENT ON FUNCTION count_campaign_replies(UUID) IS
'Count unique users who replied to campaign messages';
