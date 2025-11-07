-- Migration: Add campaign counter functions
-- Created: 2025-11-06
-- Description: Database functions for incrementing campaign sent/failed counters

-- Function to increment campaign sent counter
CREATE OR REPLACE FUNCTION increment_campaign_sent(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE campaigns
  SET total_sent = total_sent + 1
  WHERE id = _campaign_id;
END;
$$;

-- Function to increment campaign failed counter
CREATE OR REPLACE FUNCTION increment_campaign_failed(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE campaigns
  SET total_failed = total_failed + 1
  WHERE id = _campaign_id;
END;
$$;
