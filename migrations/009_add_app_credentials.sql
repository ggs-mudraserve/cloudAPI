-- Add app_id and app_secret columns to whatsapp_numbers table
-- This allows each WhatsApp number to have its own Meta App credentials
-- Required for multi-app architecture where different numbers use different Meta Apps

-- Add app_id column (Meta App ID)
ALTER TABLE whatsapp_numbers
ADD COLUMN IF NOT EXISTS app_id text;

-- Add app_secret column (Meta App Secret - used for webhook signature verification)
ALTER TABLE whatsapp_numbers
ADD COLUMN IF NOT EXISTS app_secret text;

-- Add comment explaining these columns
COMMENT ON COLUMN whatsapp_numbers.app_id IS 'Meta App ID - Found in Meta App Dashboard → Settings → Basic';
COMMENT ON COLUMN whatsapp_numbers.app_secret IS 'Meta App Secret - Used for webhook signature verification (HMAC SHA256)';
