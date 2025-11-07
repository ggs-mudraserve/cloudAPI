# 🚀 Database Setup Guide

Complete guide to setting up your Supabase database for the WhatsApp Cloud API Automation Platform.

## 📦 What's Been Created

I've generated complete SQL migration files based on your `prd.md` and `database.md` specifications:

```
migrations/
├── README.md                          # Comprehensive migration guide
├── 00_all_in_one.sql                 # Single file with entire schema ⭐ EASIEST
├── 001_core_tables.sql               # whatsapp_numbers, templates, audit
├── 002_campaign_tables.sql           # campaigns, contacts, queue
├── 003_messaging_tables.sql          # messages, status logs, reply limits
├── 004_settings_notifications.sql    # settings, notifications
├── 005_functions_triggers_views.sql  # database logic
└── 006_indexes.sql                   # performance optimization
```

---

## 🎯 Quick Setup (5 Minutes)

### Step 1: Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **"SQL Editor"** in the left sidebar

### Step 2: Run the Migration

**Option A: All-in-One (Recommended for beginners)**

1. Open `migrations/00_all_in_one.sql`
2. Copy the entire file content
3. Paste into Supabase SQL Editor
4. Click **"Run"** (or press Cmd/Ctrl + Enter)
5. Wait 10-15 seconds for completion

**Option B: Step-by-Step (Recommended for production)**

Run each file in order:
1. `001_core_tables.sql` → Run
2. `002_campaign_tables.sql` → Run
3. `003_messaging_tables.sql` → Run
4. `004_settings_notifications.sql` → Run
5. `005_functions_triggers_views.sql` → Run
6. `006_indexes.sql` → Run

### Step 3: Verify Installation

Run this verification query in SQL Editor:

```sql
-- Check all tables are created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Expected Result: 11 tables**
- ✅ audit_template_changes
- ✅ campaign_contacts
- ✅ campaigns
- ✅ global_llm_settings
- ✅ message_status_logs
- ✅ messages
- ✅ notifications
- ✅ send_queue
- ✅ templates
- ✅ user_reply_limits
- ✅ whatsapp_numbers

---

## 📊 What Was Created?

### Tables (11)

| Table | Purpose | Retention |
|-------|---------|-----------|
| `whatsapp_numbers` | Connected WhatsApp accounts | Forever |
| `templates` | Message templates from Meta | Forever (inactive marked) |
| `campaigns` | Campaign metadata | Forever |
| `campaign_contacts` | All uploaded contacts | Forever (audit trail) |
| `send_queue` | Message queue | Cleaned after campaign |
| `messages` | All conversations | 90 days |
| `message_status_logs` | Delivery receipts | 90 days |
| `user_reply_limits` | LLM reply tracking | Forever |
| `notifications` | In-app alerts | 30 days |
| `global_llm_settings` | OpenAI config | Forever |
| `audit_template_changes` | Template history | Forever |

### Functions (3)

1. **upsert_template()** - Handles template sync with conflict resolution
2. **detect_template_category_change()** - Auto-quarantines MARKETING/AUTHENTICATION templates
3. **refresh_daily_summary()** - Updates analytics materialized view

### Triggers (1)

- **trg_detect_template_category_change** - Fires when template category changes, auto-quarantines if needed

### Views (1)

- **daily_message_summary** (Materialized) - Aggregated daily metrics per number

### Indexes (35+)

- 20+ B-tree indexes for fast lookups
- 3 GIN indexes for JSONB searches
- 5 Partial indexes for optimized queries
- Composite indexes for complex queries

---

## 🔐 Next Steps

### 1. Create Admin Account

```bash
# In Supabase Dashboard:
# 1. Go to Authentication → Users
# 2. Click "Add user"
# 3. Enter email and password
# 4. Save
```

### 2. Insert Initial Settings (Optional)

```sql
-- Insert global LLM settings
INSERT INTO global_llm_settings (
  model_name,
  api_key,
  temperature,
  max_tokens
) VALUES (
  'gpt-4o-mini',
  'your_openai_api_key_here',
  0.7,
  512
);
```

### 3. Configure Environment Variables

Create `.env` file in your project root:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key_here
META_APP_ID=your_meta_app_id
META_ACCESS_TOKEN=your_meta_system_token
META_WEBHOOK_VERIFY_TOKEN=your_webhook_token
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
PORT=8080
TZ=Asia/Kolkata
NODE_ENV=production
```

### 4. Start Building Your Backend

Now you can:
- Connect your Node.js backend to Supabase
- Start implementing API routes
- Set up webhook handlers
- Build campaign processing logic

---

## 📝 Key Features Implemented

### ✅ Adaptive Rate Control
- Initial rate: 60 msg/sec
- Auto-adjusts: 10-1000 msg/sec
- Daily reset to 90% of previous day

### ✅ Template Quarantine System
- Auto-quarantines MARKETING/AUTHENTICATION templates
- Manual un-quarantine only
- Full audit trail

### ✅ LLM Reply Limits
- 40 lifetime limit per customer
- Global across all WhatsApp numbers
- Silent stop after limit

### ✅ Campaign Management
- CSV upload with validation
- Sequential execution per number
- Scheduling with pre-flight validation
- Stop/Resume support

### ✅ Message Tracking
- Idempotent webhook handling
- Status hierarchy (sent < delivered < read)
- 90-day retention

### ✅ Performance Optimization
- Strategic indexes for fast queries
- Partial indexes for queue polling
- GIN indexes for JSONB searches

---

## 🔧 Database Configuration

### Recommended Supabase Settings

```
Compute: Starter (sufficient for MVP)
Database: PostgreSQL 15+
Connection Pooling: Enabled
```

### Enable Real-time (Optional)

```sql
-- Enable real-time for campaigns table
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;

-- Enable real-time for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

---

## 🐛 Troubleshooting

### "Permission denied" error?
- Make sure you're using the service role key (not anon key)
- Check your Supabase project is active

### "Relation already exists" error?
- Some tables might already exist
- Drop them first (see rollback in README.md)
- Or skip that specific migration

### Trigger not working?
```sql
-- Check trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'trg_detect_template_category_change';
```

### Materialized view empty?
```sql
-- Manually refresh
SELECT refresh_daily_summary();
```

---

## 📚 Documentation References

- **prd.md** - Product requirements (v1.2.0)
- **database.md** - Detailed schema docs (v1.2.0)
- **CLAUDE.md** - Development guidelines (v1.2.0)
- **ops.md** - Operations guide (v1.1.0)
- **migrations/README.md** - Complete migration guide

---

## ✅ Setup Checklist

- [ ] Supabase project created
- [ ] All migration files run successfully
- [ ] 11 tables verified
- [ ] Admin account created via Supabase Auth
- [ ] Global LLM settings inserted
- [ ] Environment variables configured
- [ ] Real-time enabled (optional)

---

## 🎉 You're Ready!

Your database is now fully set up with:
- 11 tables with proper relationships
- 35+ performance indexes
- 3 functions + 1 trigger
- 1 materialized view
- Complete audit trails
- Automatic data retention policies

**Next:** Start building your backend API and connect to this database!

---

**Setup Guide Version:** 1.0.0
**Database Schema:** v1.2.0
**Status:** Production Ready ✅
