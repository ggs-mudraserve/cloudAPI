-- ========================================
-- WhatsApp Campaign App - Complete Schema
-- Version: 1.2.0
-- Generated: November 13, 2025
-- ========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- TABLE: whatsapp_numbers
-- ========================================
CREATE TABLE whatsapp_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  display_name text,
  access_token text,
  phone_number_id text,
  system_prompt text,
  max_send_rate_per_sec integer DEFAULT 60,
  last_stable_rate_per_sec integer DEFAULT 60,
  last_updated timestamptz DEFAULT now(),
  quality_rating text,
  tier text,
  is_active boolean DEFAULT true,
  -- New fields from cloud API
  waba_id text,
  profile_picture_url text,
  verified_name text,
  app_id text,
  app_secret text
);

-- ========================================
-- TABLE: templates
-- ========================================
CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  name text,
  category text CHECK (category IN ('UTILITY','MARKETING','AUTHENTICATION')),
  language text,
  status text,
  components jsonb,
  last_synced timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  is_quarantined boolean DEFAULT false,
  UNIQUE(name, whatsapp_number_id)
);

CREATE INDEX idx_templates_number_id ON templates(whatsapp_number_id);
CREATE INDEX idx_templates_category ON templates(category);

-- ========================================
-- TABLE: audit_template_changes
-- ========================================
CREATE TABLE audit_template_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  template_name text,
  old_category text,
  new_category text,
  detected_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_template_changes_number_id ON audit_template_changes(whatsapp_number_id);

-- ========================================
-- TABLE: campaigns
-- ========================================
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  template_names text[],
  total_contacts integer,
  invalid_contacts_count integer DEFAULT 0,
  total_sent integer DEFAULT 0,
  total_failed integer DEFAULT 0,
  start_time timestamptz,
  end_time timestamptz,
  scheduled_start_time timestamptz,
  is_scheduled boolean DEFAULT false,
  status text CHECK (status IN ('scheduled','running','paused','completed','failed')) DEFAULT 'scheduled',
  created_at timestamptz DEFAULT now(),
  use_template_media boolean DEFAULT false
);

CREATE INDEX idx_campaigns_number_id ON campaigns(whatsapp_number_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);

-- ========================================
-- TABLE: campaign_contacts
-- ========================================
CREATE TABLE campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  phone text,
  template_name text,
  variables jsonb,
  is_valid boolean DEFAULT true,
  invalid_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_phone ON campaign_contacts(phone);

-- ========================================
-- TABLE: send_queue
-- ========================================
CREATE TABLE send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  template_name text,
  phone text,
  payload jsonb,
  status text CHECK (status IN ('pending','ready','processing','sent','failed')) DEFAULT 'pending',
  retry_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  next_retry_at timestamptz,
  sent_at timestamptz,
  whatsapp_message_id text
);

CREATE INDEX idx_send_queue_status ON send_queue(status) WHERE status IN ('ready', 'processing');
CREATE INDEX idx_send_queue_campaign_id ON send_queue(campaign_id);
CREATE INDEX idx_send_queue_next_retry ON send_queue(next_retry_at) WHERE status = 'ready';

-- ========================================
-- TABLE: messages
-- ========================================
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  user_phone text,
  direction text CHECK (direction IN ('incoming','outgoing')),
  message_type text,
  message_body text,
  template_name text,
  campaign_id uuid REFERENCES campaigns(id),
  whatsapp_message_id text UNIQUE,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_user_phone ON messages(user_phone);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_whatsapp_message_id ON messages(whatsapp_message_id);
CREATE INDEX idx_messages_campaign_id ON messages(campaign_id);

-- ========================================
-- TABLE: user_reply_limits
-- ========================================
CREATE TABLE user_reply_limits (
  user_phone text PRIMARY KEY,
  reply_count integer DEFAULT 0,
  last_reply_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- TABLE: message_status_logs
-- ========================================
CREATE TABLE message_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id),
  campaign_id uuid REFERENCES campaigns(id),
  user_phone text,
  whatsapp_message_id text,
  status text CHECK (status IN ('sent','delivered','read','failed')),
  error_code text,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX uniq_status_log ON message_status_logs(whatsapp_message_id, status);
CREATE INDEX idx_message_status_logs_created_at ON message_status_logs(created_at);
CREATE INDEX idx_message_status_logs_message_id ON message_status_logs(message_id);

-- ========================================
-- TABLE: global_llm_settings
-- ========================================
CREATE TABLE global_llm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text,
  api_key text,
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 512,
  updated_at timestamptz DEFAULT now()
);

-- ========================================
-- TABLE: notifications
-- ========================================
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text CHECK (type IN ('info','success','warning','error')),
  title text,
  message text,
  action_url text,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz DEFAULT now(),
  is_read boolean DEFAULT false
);

CREATE INDEX idx_notifications_is_read ON notifications(is_read, created_at DESC);

-- ========================================
-- MATERIALIZED VIEW: daily_message_summary
-- ========================================
CREATE MATERIALIZED VIEW daily_message_summary AS
SELECT
  whatsapp_number_id,
  DATE(created_at) AS date,
  COUNT(*) FILTER (WHERE status='sent') AS sent_count,
  COUNT(*) FILTER (WHERE status='delivered') AS delivered_count,
  COUNT(*) FILTER (WHERE status='read') AS read_count,
  COUNT(*) FILTER (WHERE status='failed') AS failed_count
FROM message_status_logs
GROUP BY whatsapp_number_id, DATE(created_at);

CREATE UNIQUE INDEX idx_daily_summary_unique ON daily_message_summary(whatsapp_number_id, date);

-- ========================================
-- FUNCTION: upsert_template
-- ========================================
CREATE OR REPLACE FUNCTION upsert_template(_number_id uuid, _data jsonb)
RETURNS void AS $$
BEGIN
  INSERT INTO templates (whatsapp_number_id, name, category, language, status, components)
  VALUES (_number_id, _data->>'name', _data->>'category', _data->>'language', _data->>'status', _data->'components')
  ON CONFLICT (name, whatsapp_number_id)
  DO UPDATE SET
    category = EXCLUDED.category,
    status = EXCLUDED.status,
    components = EXCLUDED.components,
    last_synced = now();
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- FUNCTION: detect_template_category_change
-- ========================================
CREATE OR REPLACE FUNCTION detect_template_category_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.category <> OLD.category THEN
    -- Log all category changes
    INSERT INTO audit_template_changes (whatsapp_number_id, template_name, old_category, new_category)
    VALUES (NEW.whatsapp_number_id, NEW.name, OLD.category, NEW.category);

    -- Quarantine MARKETING and AUTHENTICATION templates
    IF NEW.category IN ('MARKETING', 'AUTHENTICATION') THEN
      NEW.is_quarantined := true;
      NEW.is_active := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- TRIGGER: trg_detect_template_category_change
-- ========================================
CREATE TRIGGER trg_detect_template_category_change
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION detect_template_category_change();

-- ========================================
-- FUNCTION: refresh_daily_summary
-- ========================================
CREATE OR REPLACE FUNCTION refresh_daily_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW daily_message_summary;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- FUNCTION: increment_campaign_sent
-- ========================================
CREATE OR REPLACE FUNCTION increment_campaign_sent(_campaign_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET total_sent = total_sent + 1
  WHERE id = _campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- FUNCTION: increment_campaign_failed
-- ========================================
CREATE OR REPLACE FUNCTION increment_campaign_failed(_campaign_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET total_failed = total_failed + 1
  WHERE id = _campaign_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- GRANT PERMISSIONS
-- ========================================
-- Grant access to anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ========================================
-- ROW LEVEL SECURITY (Optional - Disabled for now)
-- ========================================
-- All tables have RLS disabled for simplicity
-- Can be enabled later with policies if multi-tenant access needed

-- ========================================
-- SCHEMA CREATION COMPLETE
-- ========================================
-- Total Tables: 11
-- Total Views: 1 (materialized)
-- Total Functions: 5 (upsert_template, detect_template_category_change, refresh_daily_summary, increment_campaign_sent, increment_campaign_failed)
-- Total Triggers: 1
-- Total Indexes: 34
