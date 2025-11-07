# 🧩 Database Design Document — Supabase Schema

This document defines all database tables, relationships, and supporting SQL functions for the WhatsApp Cloud API Automation App.

---

## 1️⃣ Overview

All data is stored in **Supabase Postgres** using normalized schema for integrity and scalability.

### Key Entities

* **whatsapp_numbers** → connected WhatsApp accounts.
* **templates** → synced template metadata.
* **campaigns** → high-level bulk send operations.
* **campaign_contacts** → permanent storage of all uploaded contacts with variables.
* **send_queue** → persistent message queue (cleaned after campaign completes).
* **messages** → inbound/outbound chat logs (90-day retention).
* **message_status_logs** → delivery and read receipts (90-day retention).
* **user_reply_limits** → LLM reply count tracking per customer.
* **global_llm_settings** → OpenAI config.
* **audit_template_changes** → compliance logging.
* **notifications** → in-dashboard alerts (30-day retention).

---

## 2️⃣ Table Definitions

### 🟩 whatsapp_numbers

Stores connected numbers and adaptive send rate metadata.

```sql
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
  is_active boolean DEFAULT true
);
```

**Notes:**
- Initial rate starts at 60 msg/sec (both max and last_stable).
- Rate adjusts dynamically: Floor = 10 msg/sec, Ceiling = 1000 msg/sec.
- Daily reset (IST): First campaign of day starts at 90% of last_stable_rate_per_sec.

---

### 🟦 templates

Holds all templates synced from WhatsApp Cloud API.

```sql
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
```

**Notes:**
- Unique constraint on (name, whatsapp_number_id) prevents duplicate templates per number.
- Templates with category 'MARKETING' are automatically quarantined (is_quarantined = true, is_active = false) via trigger.

---

### 🟧 audit_template_changes

Tracks any template category changes.

```sql
CREATE TABLE audit_template_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  template_name text,
  old_category text,
  new_category text,
  detected_at timestamptz DEFAULT now()
);
```

---

### 🟨 campaigns

Metadata for each bulk campaign.

```sql
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  whatsapp_number_id uuid REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  template_names text[],
  total_contacts integer,
  invalid_contacts_count integer DEFAULT 0,
  total_sent integer DEFAULT 0,
  total_failed integer DEFAULT 0,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  scheduled_start_time timestamptz,
  is_scheduled boolean DEFAULT false,
  status text CHECK (status IN ('scheduled','running','paused','completed','failed')) DEFAULT 'scheduled',
  created_at timestamptz DEFAULT now()
);
```

**Notes:**
- `csv_file_url` removed - CSV files are parsed and discarded immediately
- `invalid_contacts_count` tracks rows that failed validation (shown to user after upload)
- Contact data permanently stored in `campaign_contacts` table

---

### 🟧 campaign_contacts

Permanent storage of all uploaded contacts with CSV variables.

```sql
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
```

**Notes:**
- Stores ALL rows from CSV (both valid and invalid) permanently
- `variables` stores all CSV columns as JSON for audit trail
- `is_valid` flag indicates if row passed validation
- Phone validation: Must be exactly 12 digits starting with 91 (India only)
- Never deleted - provides complete historical record of all campaign uploads

---

### 🟥 send_queue

Persistent queue for campaign jobs.

```sql
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
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_send_queue_status ON send_queue(status) WHERE status IN ('ready', 'processing');
```

**Notes:**
- Queue survives server restarts for reliability
- Batch processing: Fetch up to `max_send_rate_per_sec` messages per second
- Stuck message recovery: Cron job resets `status='processing'` > 5 minutes to `status='ready'`
- Row-level locking: Use `FOR UPDATE SKIP LOCKED` to prevent race conditions
- **Cleanup:** After campaign completes, all records for that campaign are deleted from this table
- Historical contact data preserved in `campaign_contacts` table

---

### 🟪 messages

Stores inbound and outbound messages.

```sql
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
```

**Notes:**
- **90-day retention:** Daily cron job deletes messages older than 90 days
- Status hierarchy: sent < delivered < read < failed (never downgrade)
- Used for LLM context (last 10 messages per user_phone)

---

### 🟪 user_reply_limits

Tracks LLM reply count per customer phone number to enforce lifetime limit.

```sql
CREATE TABLE user_reply_limits (
  user_phone text PRIMARY KEY,
  reply_count integer DEFAULT 0,
  last_reply_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

**Notes:**
- Enforces maximum 40 LLM replies per customer phone number (lifetime limit).
- After 40 replies, auto-replies silently stop.
- Counter is global across all WhatsApp numbers in the system.
- No automatic reset mechanism (manual DB update if needed).

---

### 🟫 message_status_logs

Each delivery/read event from WhatsApp webhook.

```sql
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
CREATE UNIQUE INDEX uniq_status_log
  ON message_status_logs(whatsapp_message_id, status);
CREATE INDEX idx_message_status_logs_created_at ON message_status_logs(created_at);
```

**Notes:**
- **UNIQUE constraint:** Prevents duplicate status events (e.g., two "delivered" webhooks)
- **Status hierarchy:** Only update `messages.status` if new status is higher in hierarchy
- **90-day retention:** Daily cron job deletes logs older than 90 days
- **Out-of-order handling:** Status logs preserve all events; `messages.status` uses hierarchy
- Webhooks can be delayed by hours - dashboard shows warning about delayed stats

---

### 🟫 daily_message_summary (Materialized View)

Aggregated day-wise delivery metrics.

```sql
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
```

Refresh daily:

```sql
REFRESH MATERIALIZED VIEW daily_message_summary;
```

---

### 🟩 global_llm_settings

Stores global OpenAI configuration.

```sql
CREATE TABLE global_llm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text,
  api_key text,
  temperature numeric DEFAULT 0.7,
  max_tokens integer DEFAULT 512,
  updated_at timestamptz DEFAULT now()
);
```

---

### 🟦 notifications

Dashboard event alerts.

```sql
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
```

**Notes:**
- **30-day retention:** Daily cron job deletes notifications older than 30 days
- **Real-time updates:** Frontend subscribes via Supabase Realtime
- **Click actions:** `action_url` and entity fields enable navigation to relevant pages
- **Pagination:** Show last 50 notifications, load more on request
- **Created by:** Manual backend code (not database triggers) for flexibility

---

## 3️⃣ Functions & Cron Jobs

### 🔹 Function: Insert or Update Template (Sync)

```sql
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
```

### 🔹 Function: Detect Category Change (Quarantine)

```sql
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
    -- NO auto un-quarantine - manual only via UI/API
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_detect_template_category_change
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION detect_template_category_change();
```

**Notes:**
- Only UTILITY templates are allowed in campaigns
- MARKETING and AUTHENTICATION templates are automatically quarantined
- Once quarantined, templates must be manually un-quarantined by admin
- Manual un-quarantine only possible if current category is UTILITY
- Template category history visible in `audit_template_changes`

### 🔹 Function: Daily Summary Refresh

```sql
CREATE OR REPLACE FUNCTION refresh_daily_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW daily_message_summary;
END;
$$ LANGUAGE plpgsql;
```

Schedule via Supabase cron every midnight IST.

---

### 🔹 Cron Jobs (via PM2/Node-cron)

**Cleanup Jobs (3 AM IST daily):**
```javascript
// Delete old messages (90-day retention)
cron.schedule('0 3 * * *', async () => {
  await db.query(`DELETE FROM messages WHERE created_at < NOW() - INTERVAL '90 days'`);
  await db.query(`DELETE FROM message_status_logs WHERE created_at < NOW() - INTERVAL '90 days'`);
});

// Delete old notifications (30-day retention)
cron.schedule('0 3 * * *', async () => {
  await db.query(`DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'`);
});
```

**Stuck Message Recovery (every 5 minutes):**
```javascript
cron.schedule('*/5 * * * *', async () => {
  await db.query(`
    UPDATE send_queue
    SET status = 'ready', updated_at = NOW()
    WHERE status = 'processing'
    AND updated_at < NOW() - INTERVAL '5 minutes'
  `);
});
```

---

## 4️⃣ Relationships

* `whatsapp_numbers` 1↔N `templates`
* `whatsapp_numbers` 1↔N `campaigns`
* `whatsapp_numbers` 1↔N `messages`
* `campaigns` 1↔N `campaign_contacts` (permanent storage)
* `campaigns` 1↔N `send_queue` (temporary, cleaned after completion)
* `campaigns` 1↔N `messages`
* `messages` 1↔N `message_status_logs`
* `user_reply_limits` standalone (indexed by user_phone)

---

## 5️⃣ Indexes & Performance

* Indexes on `created_at` for all high-write tables (`send_queue`, `message_status_logs`, `messages`).
* Partial index on `status='ready'` for fast queue polling.
* `GIN` index on JSON fields (`components`, `payload`) for selective searches.
* Index on `user_reply_limits.user_phone` (PRIMARY KEY provides this automatically).
* Index on `messages.user_phone` for fast LLM reply limit lookups.

---

## 6️⃣ Backup

Handled by Supabase’s daily snapshot and PITR system (no custom backup functions required).

---

**Status:** Finalized Database Schema v1.2.0

**Changelog v1.2.0:**
- Added `campaign_contacts` table for permanent storage of all uploaded contacts with variables
- Updated `campaigns` table: removed `csv_file_url`, added `invalid_contacts_count`
- Added cleanup cron jobs: 90-day retention for messages/status logs, 30-day for notifications
- Added stuck message recovery cron job (every 5 minutes)
- Updated `send_queue` with notes on batch processing and cleanup after campaign completion
- Added notes on message/status log retention and status hierarchy
- Updated `notifications` table with action_url, entity tracking, and retention notes
- Updated template trigger to quarantine both MARKETING and AUTHENTICATION templates (manual un-quarantine only)
- Added comprehensive indexes for performance (campaign_contacts, messages, status logs, notifications)
- Updated relationships to include campaign_contacts

**Changelog v1.1.0:**
- Updated `whatsapp_numbers` default rates: max_send_rate_per_sec and last_stable_rate_per_sec now both default to 60 msg/sec
- Added UNIQUE constraint on `templates(name, whatsapp_number_id)` to prevent duplicate templates
- Added new table `user_reply_limits` to track LLM reply counts per customer (40 lifetime limit)
- Added notes on adaptive rate control (floor=10, ceiling=1000, IST daily reset)
- Added index on `messages.user_phone` for fast reply limit lookups
- Updated relationships to include user_reply_limits
