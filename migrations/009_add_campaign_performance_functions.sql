-- Migration: Add performance optimization functions for campaign details
-- Created: 2025-11-14
-- Purpose: Optimize "View Details" popup performance for large campaigns

-- Function to get campaign contact distribution (aggregated)
-- This replaces fetching all campaign_contacts records and aggregating in JavaScript
CREATE OR REPLACE FUNCTION get_campaign_contact_distribution(p_campaign_id UUID)
RETURNS TABLE (
  template_name TEXT,
  valid_count BIGINT,
  invalid_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.template_name,
    COUNT(*) FILTER (WHERE cc.is_valid = true) AS valid_count,
    COUNT(*) FILTER (WHERE cc.is_valid = false) AS invalid_count
  FROM campaign_contacts cc
  WHERE cc.campaign_id = p_campaign_id
    AND cc.template_name IS NOT NULL
  GROUP BY cc.template_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION get_campaign_contact_distribution IS 'Returns aggregated contact distribution by template for a campaign (performance optimized)';
