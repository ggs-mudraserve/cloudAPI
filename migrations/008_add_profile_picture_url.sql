-- Add profile_picture_url column to whatsapp_numbers table
ALTER TABLE whatsapp_numbers
ADD COLUMN IF NOT EXISTS profile_picture_url text;

-- Add verified_name column to store the WhatsApp verified business name
ALTER TABLE whatsapp_numbers
ADD COLUMN IF NOT EXISTS verified_name text;
