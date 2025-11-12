-- Add use_template_media column to campaigns table
-- This flag indicates whether to use the template's approved media URL
-- instead of the media URL from the CSV

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS use_template_media BOOLEAN DEFAULT false;

COMMENT ON COLUMN campaigns.use_template_media IS 'When true, uses the template''s approved WhatsApp CDN media URL instead of CSV-provided media';
