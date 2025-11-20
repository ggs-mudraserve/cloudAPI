-- Migration: Add optimized RPC function for template statistics
-- Date: November 18, 2025
-- Purpose: Replace 125+ queries with 1 aggregation query for template stats

-- Drop function if exists (for rerunning migration)
DROP FUNCTION IF EXISTS get_template_stats_fast(UUID);

-- Create optimized template stats function
CREATE OR REPLACE FUNCTION get_template_stats_fast(p_campaign_id UUID)
RETURNS TABLE (
  template_name TEXT,
  total BIGINT,
  sent BIGINT,
  delivered BIGINT,
  read BIGINT,
  replied BIGINT,
  failed BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Get send_queue stats (sent/failed from queue)
  queue_stats AS (
    SELECT
      sq.template_name,
      COUNT(*) as total_contacts,
      COUNT(*) FILTER (WHERE sq.status = 'sent') as sent_count,
      COUNT(*) FILTER (WHERE sq.status = 'failed') as failed_count,
      array_agg(DISTINCT sq.whatsapp_message_id) FILTER (WHERE sq.whatsapp_message_id IS NOT NULL) as message_ids,
      array_agg(DISTINCT sq.phone) as phones
    FROM send_queue sq
    WHERE sq.campaign_id = p_campaign_id
      AND sq.template_name IS NOT NULL
    GROUP BY sq.template_name
  ),

  -- Get delivery/read stats from status logs
  status_stats AS (
    SELECT
      qs.template_name,
      COUNT(DISTINCT CASE
        WHEN msl.status IN ('delivered', 'read')
        THEN msl.whatsapp_message_id
      END) as delivered_count,
      COUNT(DISTINCT CASE
        WHEN msl.status = 'read'
        THEN msl.whatsapp_message_id
      END) as read_count,
      COUNT(DISTINCT CASE
        WHEN msl.status = 'failed'
        THEN msl.whatsapp_message_id
      END) as status_failed_count
    FROM queue_stats qs
    LEFT JOIN LATERAL (
      SELECT msl.whatsapp_message_id, msl.status
      FROM message_status_logs msl
      WHERE msl.whatsapp_message_id = ANY(qs.message_ids)
        AND msl.campaign_id = p_campaign_id
    ) msl ON true
    GROUP BY qs.template_name
  ),

  -- Get reply stats
  reply_stats AS (
    SELECT
      qs.template_name,
      COUNT(DISTINCT m_out.user_phone) as replied_count
    FROM queue_stats qs
    LEFT JOIN LATERAL (
      SELECT DISTINCT m_out.user_phone, m_out.whatsapp_number_id
      FROM messages m_out
      WHERE m_out.campaign_id = p_campaign_id
        AND m_out.direction = 'outgoing'
        AND m_out.user_phone = ANY(qs.phones)
    ) m_out ON true
    LEFT JOIN LATERAL (
      SELECT 1
      FROM messages m_in
      WHERE m_in.direction = 'incoming'
        AND m_in.user_phone = m_out.user_phone
        AND m_in.whatsapp_number_id = m_out.whatsapp_number_id
      LIMIT 1
    ) m_in ON true
    WHERE m_in IS NOT NULL
    GROUP BY qs.template_name
  )

  -- Combine all stats
  SELECT
    qs.template_name::TEXT,
    qs.total_contacts,
    qs.sent_count,
    COALESCE(ss.delivered_count, 0),
    COALESCE(ss.read_count, 0),
    COALESCE(rs.replied_count, 0),
    qs.failed_count + COALESCE(ss.status_failed_count, 0) as total_failed
  FROM queue_stats qs
  LEFT JOIN status_stats ss ON qs.template_name = ss.template_name
  LEFT JOIN reply_stats rs ON qs.template_name = rs.template_name
  ORDER BY qs.template_name;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_template_stats_fast(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_template_stats_fast(UUID) TO service_role;

-- Add comment
COMMENT ON FUNCTION get_template_stats_fast(UUID) IS
'Optimized template statistics aggregation. Replaces 125+ queries with 1 query.';
