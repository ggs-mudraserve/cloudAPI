-- Migration: Create media_library table
-- Description: Store uploaded media files with their WhatsApp Media IDs
-- Created: 2025-01-15

CREATE TABLE IF NOT EXISTS media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id UUID NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL, -- WhatsApp Media ID
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'video', 'image', 'document', 'audio'
  mime_type TEXT NOT NULL, -- 'video/mp4', 'image/jpeg', etc.
  file_size INTEGER NOT NULL, -- in bytes
  description TEXT, -- optional user description
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_media_library_whatsapp_number ON media_library(whatsapp_number_id);
CREATE INDEX idx_media_library_file_type ON media_library(file_type);
CREATE INDEX idx_media_library_created_at ON media_library(created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_media_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_library_updated_at
  BEFORE UPDATE ON media_library
  FOR EACH ROW
  EXECUTE FUNCTION update_media_library_updated_at();

-- Comments
COMMENT ON TABLE media_library IS 'Stores uploaded media files with their WhatsApp Media IDs per WhatsApp number';
COMMENT ON COLUMN media_library.media_id IS 'WhatsApp Cloud API Media ID (permanent, can be reused)';
COMMENT ON COLUMN media_library.file_type IS 'Media category: video, image, document, or audio';
COMMENT ON COLUMN media_library.mime_type IS 'Original file MIME type (e.g., video/mp4, image/jpeg)';
