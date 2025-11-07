# 📋 Complete Specification Decisions

All 20 gap-filling questions have been resolved. This document summarizes all decisions made.

---

## 🔴 Critical Decisions (Questions 1-5)

### 1. Authentication & User Management ✅
- **Method:** Supabase Email/Password Auth
- **Setup:** Single admin account created manually via Supabase dashboard
- **No signup page** in application
- **Session:** JWT tokens, 1-hour expiration with auto-refresh
- **Password reset:** Supabase's built-in email recovery flow

### 2. WhatsApp Number Onboarding ✅
- **UI Form** with fields: Display Name, Phone Number ID, Access Token, System Prompt
- **"Test Connection"** button validates token before saving
- **Actions:** Add and Delete only (no Edit)
- **Token expiration:** Mark `is_active=false`, notify admin

### 3. LLM Auto-Reply Logic ✅
- Reply to **text messages only** (skip media, location, contacts)
- **40 lifetime limit** per customer phone number (global across all WhatsApp numbers)
- After 40: **silent stop** (no message)
- **Immediate/synchronous** processing in webhook handler
- On LLM failure: log and skip (no retry, no fallback)
- No rate limiting on LLM calls

### 4. Campaign Scheduling ✅
- **All times in IST** (India Standard Time)
- Admin can **delete** scheduled campaigns (no edit)
- **Pre-flight validation:** Check templates are `is_active=true` AND `category='UTILITY'`
- If validation fails: set status to `'failed'`, create notification
- Multiple scheduled campaigns same time/number: **run sequentially**

### 5. Adaptive Rate Control ✅
- **Increase +10%:** Error rate < 1% for 5 continuous minutes
- **Decrease -20%:** 3 consecutive 429 errors (error code 130429)
- **Initial:** 60 msg/sec, **Floor:** 10 msg/sec, **Ceiling:** 1000 msg/sec
- **Daily reset (IST):** First campaign of day starts at 90% of previous day's rate
- **Within day:** Carry forward current rate between campaigns
- Global rate per WhatsApp number (shared across campaigns)

---

## 🟡 Important Decisions (Questions 6-15)

### 6. CSV & Media Handling ✅
- **CSV file:** Parse immediately and discard (don't store)
- **New table:** `campaign_contacts` - permanent storage of ALL contacts (valid + invalid)
- **Media:** URLs only (user-provided, no file uploads)
- **Validation:** Skip invalid rows, show summary (e.g., "50 invalid rows skipped")
- **Cleanup:** After campaign completes, delete `send_queue` records, keep `campaign_contacts`

### 7. Contact Distribution ✅
- **Sequential chunks** with equal split among templates
- **Remainder:** Goes to last template
- Example: 100 contacts, 3 templates → [0-33] Template A, [34-66] Template B, [67-99] Template C

### 8. Queue Processing & Recovery ✅
- **Batch processing:** Fetch up to `max_send_rate_per_sec` messages per second
- **Server restart:** Auto-resume campaigns, reset stuck messages to `ready`
- **Stuck messages:** Cron every 5 min resets `status='processing'` > 5 min to `ready`
- **Concurrency:** Use `FOR UPDATE SKIP LOCKED` for row-level locking

### 9. Phone Number Validation ✅
- **Format:** `919876543210` (exactly 12 digits, starts with 91)
- **India only** (no other country codes)
- **Display:** Show validation errors after upload

### 10. Template Sync Details ✅
- **Endpoint:** `GET /{WABA-ID}/message_templates`
- **Pagination:** Handle with cursor (`after` parameter)
- **Deleted templates:** Mark `is_active=false` (don't delete from DB)
- **Network failure:** Allow partial updates (next sync completes)
- **Sync buttons:** Both global "Sync All" and per-number "Sync"

### 11. Message Status Tracking ✅
- **Status hierarchy:** sent < delivered < read < failed (only upgrade, never downgrade)
- **UNIQUE constraint:** Keep on `message_status_logs(whatsapp_message_id, status)`
- **No timeout:** Trust WhatsApp webhooks indefinitely
- **Dashboard warning:** "Delivery stats may take up to 24 hours to fully update"

### 12. Adaptive Rate Control Implementation ✅
- **In-memory Rate Controller** class per active campaign
- **Track:** Last 5 minutes of results for error rate calculation
- **Persist:** Save to DB every 5 minutes or on rate change
- **Daily reset:** Check at campaign start (first of day)
- **End of campaign:** Update `last_stable_rate_per_sec` with final rate

### 13. Dashboard Real-time Updates ✅
- **Supabase Realtime** for live updates
- Subscribe to: campaigns table, notifications table
- **Fallback:** 30-second polling if Realtime connection drops
- Free tier sufficient for single-admin use case

### 14. Notification System ✅
- **Mark as read:** API endpoints for single and bulk operations
- **Retention:** Delete after 30 days (daily cron)
- **Pagination:** Show last 50, load more on request
- **Creation:** Manual backend code (not triggers)
- **Click action:** Store `related_entity_type`, `related_entity_id`, `action_url` for navigation

### 15. Template Categories ✅
- **Only UTILITY allowed** in campaigns
- **MARKETING and AUTHENTICATION:** Both automatically quarantined
- **Manual un-quarantine ONLY** (no automatic when changed back to UTILITY)
- Un-quarantine button only enabled if current category is UTILITY

---

## 🟢 Minor Decisions (Questions 16-20)

### 16. Frontend Build Configuration ✅
- **Framework:** Vite + React + Tailwind CSS
- **Auth library:** `@supabase/supabase-js` directly
- **API config:** Environment variables (`.env.local`)

### 17. Backend Structure ✅
- **Organization:** Routes / Controllers / Services separation
- **Webhook verification:** SHA256 HMAC with `X-Hub-Signature-256`
- **File structure:** Standard MVC pattern

### 18. Error Response Format ✅
- **Success:** `{ success: true, data: {...} }`
- **Error:** `{ success: false, error: { code: "ERROR_CODE", message: "...", details: {...} } }`
- **Status codes:** 200, 201, 400, 401, 403, 404, 429, 500

### 19. Environment Variables ✅
- **META_ACCESS_TOKEN:** System user token for WABA-level operations (template sync)
- **Per-number tokens:** Stored in database `whatsapp_numbers` table for sending messages
- Keep naming as `META_ACCESS_TOKEN` (don't rename)

### 20. Conversation History ✅
- **Retention:** 90 days
- **Cleanup:** Daily cron job deletes messages and status logs > 90 days
- **LLM context:** Uses last 10 messages (unaffected by cleanup)

---

## 📊 New Database Tables

### campaign_contacts
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
```
**Purpose:** Permanent storage of all uploaded contacts (valid + invalid)

---

## 🔄 Updated Tables

### campaigns
- **Removed:** `csv_file_url`
- **Added:** `invalid_contacts_count integer DEFAULT 0`

### notifications
- **Added:** `action_url text`, `related_entity_type text`, `related_entity_id uuid`

---

## ⏰ Cron Jobs Summary

| Job | Schedule | Purpose |
|-----|----------|---------|
| Template sync | Every 3 hours | Sync templates from WhatsApp Cloud API |
| Campaign scheduler | Every minute | Check and start scheduled campaigns |
| Daily summary | Midnight IST | Refresh materialized view |
| Message cleanup | 3 AM IST | Delete messages > 90 days |
| Notification cleanup | 3 AM IST | Delete notifications > 30 days |
| Stuck message recovery | Every 5 minutes | Reset processing > 5 min to ready |

---

## 🎯 Data Retention Policies

| Data Type | Retention | Cleanup Method |
|-----------|-----------|----------------|
| Messages | 90 days | Daily cron deletion |
| Message status logs | 90 days | Daily cron deletion |
| Notifications | 30 days | Daily cron deletion |
| Campaign contacts | Forever | Never deleted |
| Send queue | Until campaign complete | Deleted after campaign |
| Templates | Forever | Mark inactive only |

---

## 🚀 Technology Stack Final

**Frontend:**
- Vite + React 18+
- Tailwind CSS
- @supabase/supabase-js
- Supabase Realtime subscriptions

**Backend:**
- Node.js 18+ + Express
- Supabase (PostgreSQL)
- node-cron for scheduling
- PM2 for process management

**APIs:**
- WhatsApp Cloud API (v17.0+)
- OpenAI API
- Supabase REST + Realtime

**Infrastructure:**
- Single VPS (Ubuntu 22+)
- Nginx reverse proxy + Let's Encrypt
- TZ=Asia/Kolkata (IST timezone)

---

## ✅ All 20 Questions Resolved

**Status:** Ready for development

This document serves as the complete specification reference. All decisions have been incorporated into:
- `prd.md` (v1.2.0)
- `database.md` (v1.2.0)
- `ops.md` (v1.1.0)
- `CLAUDE.md` (v1.1.0)
