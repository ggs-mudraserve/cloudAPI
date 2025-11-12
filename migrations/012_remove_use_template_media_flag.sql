-- Remove use_template_media column from campaigns table
-- This feature was removed as WhatsApp API doesn't support omitting media header parameters

ALTER TABLE campaigns
DROP COLUMN IF EXISTS use_template_media;
