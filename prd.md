# 📘 Product Requirement Document (PRD)

## 1️⃣ Overview

The application is a **WhatsApp Cloud API automation platform** designed for large-scale, template-based messaging and LLM-driven conversations. It connects multiple WhatsApp numbers under one Meta Business Account and manages campaigns, templates, conversations, and AI responses from a centralized dashboard.

**Primary Goals:**

* Bulk sending of WhatsApp templates using Cloud API.
* Manage multiple WhatsApp numbers under one Meta App.
* Automatically sync templates, detect category changes, and quarantine Marketing templates.
* Integrate an OpenAI LLM for automated replies with system prompts.
* Provide a clean, React-based admin dashboard for operations and analytics.

---

## 2️⃣ Core Functionalities

### A. WhatsApp Numbers Management

* Connect multiple phone numbers under one WhatsApp Cloud API App ID.
* Each number stores: access token, phone_number_id, display name, and system prompt.
* **Adding Numbers via UI:**
  * Form fields: Display Name, Phone Number ID, Access Token, System Prompt.
  * "Test Connection" button validates token via WhatsApp Cloud API before saving.
  * Only Add and Delete actions available (no Edit).
* **Token Expiration Handling:**
  * When API returns error 190 (token expired), mark number as `is_active = false`.
  * Create notification: "WhatsApp number X token expired, please update".
  * Campaigns continue to fail until admin updates token.
* Each number has independent adaptive send-rate control.
* Campaigns using the same number execute sequentially; across numbers they run in parallel.

### B. Template Sync & Management

* Auto-sync templates every 3 hours via Cloud API (`GET /{WABA-ID}/message_templates`).
* **Manual "Sync Now" options:**
  * Global "Sync All" button (syncs all WhatsApp numbers)
  * Per-number "Sync" button (syncs specific number only)
* **Template Categories:**
  * **UTILITY** - Allowed in campaigns (only this category)
  * **MARKETING** - Automatically quarantined
  * **AUTHENTICATION** - Automatically quarantined (not allowed in campaigns)
* **Quarantine Rules:**
  * Templates changing to MARKETING or AUTHENTICATION are immediately quarantined (disabled + hidden from campaigns)
  * **Manual un-quarantine only** - Admin must manually un-quarantine via UI
  * Un-quarantine button only enabled if current category is UTILITY
* **Template Deletion:** If template deleted from WhatsApp, mark as `is_active = false` (don't delete from DB)
* **Pagination Handling:** Sync handles multiple pages if account has > 100 templates
* Audit log (`audit_template_changes`) records all category transitions with history visible in UI.

### C. Bulk Campaign Sending

* Upload CSV (up to 1 lakh rows, max 50 MB file size).
* CSV format: `Phone,{{Media}},{{1}},{{2}},...`
* **Phone Number Format:** Exactly 12 digits starting with 91 (India only): `919876543210`
* **CSV Processing:**
  * CSV file parsed immediately and discarded (not stored)
  * All contacts (valid + invalid) permanently stored in `campaign_contacts` table
  * Invalid rows skipped with validation summary shown to user (e.g., "50 invalid rows skipped")
  * Only valid contacts added to `send_queue` for processing
* **Media Handling:** Media column must contain publicly accessible URLs (no file uploads)
* **CSV Variable Mapping:** User is responsible for mapping CSV columns to template variables in correct order. No in-app mapping UI.
* **Contact Distribution:** Sequential chunks with equal split among selected templates (remainder goes to last template)
* User selects multiple templates; contacts are divided evenly among selected templates.
* Each batch (per template) runs sequentially per number.
* **Queue Processing:**
  * Batch processing: Fetch up to `max_send_rate_per_sec` messages per second
  * Row-level locking (`FOR UPDATE SKIP LOCKED`) prevents race conditions
  * Stuck message recovery: Cron resets messages in `processing` > 5 minutes
  * After campaign completes: `send_queue` cleaned, `campaign_contacts` retained forever
* Adaptive throttling learns the max send-rate per number (starts at 60 msg/sec, scales dynamically up to 1000 msg/sec, minimum 10 msg/sec).
* Manual **Stop Campaign** and **Resume Campaign** buttons.
* Failed messages retried up to 3 times (exponential backoff).

### D. Message Handling & Inbox

* All inbound/outbound messages logged in Supabase.
* **Message Retention:** 90-day automatic cleanup (messages and status logs deleted after 90 days)
* **Status Tracking:**
  * Status hierarchy: sent < delivered < read < failed (never downgrade status)
  * Out-of-order webhooks handled correctly (e.g., if "read" arrives before "delivered")
  * Dashboard shows warning: "Delivery stats may take up to 24 hours to fully update"
* No manual replies — all handled by LLM.
* **LLM Auto-Reply Rules:**
  * Replies only to incoming text messages (no media, location, or contact cards).
  * Immediate/synchronous reply processing via webhook handler.
  * Maximum 40 LLM replies per customer phone number (lifetime limit across all WhatsApp numbers).
  * After 40 replies: silent stop (no further auto-replies).
  * On LLM API failure: log error and skip reply (no retry, no fallback message).
  * No rate limiting on LLM calls.
* Inbox UI (view-only): shows all conversations, search/filter by number/date.
* LLM context = system prompt + last 10 messages per user.

### E. LLM Configuration

* Global model settings for entire app (single key + model).
* Stored securely in Supabase (encrypted).
* Used by all numbers during reply generation.

### F. Adaptive Rate Control

* Each number's send rate adjusts dynamically (global rate per WhatsApp number, shared across all campaigns):
  * **Increase by +10%** when error rate is less than 1% for 5 continuous minutes.
  * **Decrease by -20%** after 3 consecutive 429 errors (WhatsApp error code 130429).
  * **Initial rate:** 60 msg/sec for new numbers.
  * **Floor:** 10 msg/sec (minimum).
  * **Ceiling:** 1000 msg/sec (maximum).
* **Rate Persistence:**
  * Within same day: carry forward current rate between campaigns.
  * Daily reset (IST calendar day): First campaign of the day starts at 90% of previous day's final rate.
  * Store in Supabase: `max_send_rate_per_sec` (current) and `last_stable_rate_per_sec` (previous day's final).

### G. Campaign Scheduling

* Option to start immediately or at a scheduled future time (all times in **IST timezone**).
* Cron/PM2 worker polls every minute for due campaigns.
* **Pre-flight Validation (before starting scheduled campaign):**
  * Check all selected templates are `is_active = true` AND category != 'MARKETING' (not quarantined).
  * If validation fails: update campaign status to `'failed'` and create notification for admin.
  * Campaign will not start if validation fails.
* **Admin Controls:**
  * Can delete scheduled campaigns before they start.
  * Cannot edit scheduled campaigns (must delete and recreate).
* **Multiple Scheduled Campaigns:** If multiple campaigns scheduled for same time on same number, they run sequentially.
* Sequentially runs all batches under same number.

### H. Logging & Analytics

* PM2 logs with daily rotation (30-day retention).
* Supabase logs campaign metrics (sent, failed, start/end times).
* **Real-time Dashboard Updates:**
  * Uses Supabase Realtime for live campaign updates
  * Frontend subscribes to campaigns and notifications tables
  * Fallback to 30-second polling if Realtime connection drops
  * Updates: total_sent, total_failed, status changes
* Dashboard shows:
  * Sent / Delivered / Read / Failed counts per campaign.
  * Delivery & read rate.
  * Average send speed and duration.
  * Export as CSV.
* **Auto-refresh:** Active campaigns update in real-time via Supabase Realtime

### I. Notifications

* In-dashboard alert bell shows system events:
  * Campaign completed/stopped.
  * Campaign failed (template validation failure).
  * Template quarantined (category change to MARKETING or AUTHENTICATION).
  * WhatsApp number token expired.
* **Notification Management:**
  * 30-day automatic retention (older notifications deleted)
  * Show last 50 notifications with "Load More" pagination
  * Mark as read (single or bulk)
  * Click notification navigates to relevant page (campaign/template/number)
  * Real-time updates via Supabase Realtime
* Stored in `notifications` table with fields: type, title, message, action_url, related_entity_type, related_entity_id, created_at, is_read.

### J. Deployment

* **Single VPS** hosting backend + frontend.
* PM2 for process management.
* Nginx + Let’s Encrypt for HTTPS.
* Supabase for DB, auth, and storage.

---

## 3️⃣ Technical Architecture

```
Frontend (React + Tailwind)
   ↓
Backend (Node + Express)
   ↓
Supabase (DB + Auth + Storage)
   ↓
WhatsApp Cloud API + OpenAI API
```

**Backend Components:**

* REST API routes for all app operations.
* Webhooks for message and status events (idempotent insert logic).
* Cron jobs for template sync, campaign activation, analytics refresh.

**Frontend Components:**

* Dashboard Home: campaign summary cards.
* Campaigns: create, monitor, stop/resume.
* Inbox: read-only conversation view.
* Templates: list + quarantine state.
* Settings: LLM key/model, system prompt.

---

## 4️⃣ Queue & Campaign Execution

### Persistent Queue

`send_queue` table handles bulk message jobs.

* Jobs persist across restarts.
* Each campaign batch unlocked sequentially.

**Queue flow:**

```
CSV upload → Split → Enqueue → Process → Update campaign summary
```

**States:** pending → ready → processing → sent → failed.

### Retry Policy

* 3 retries max per message.
* Exponential backoff (5s, 20s, 45s).
* Permanent failures logged separately.

### Sequential Execution Logic

* One number → sequential per template batch.
* Multiple numbers → parallel across numbers.

---

## 5️⃣ Webhook & Message Sync

* Fully idempotent message and status insertions.
* Duplicates ignored using `whatsapp_message_id`.
* Delivery status logs stored separately in `message_status_logs`.
* Daily rollup views provide per-number Sent/Delivered/Read/Failed counts.

---

## 6️⃣ Backup & Recovery

* Supabase native daily backups (auto-managed).
* Optional manual clone from Supabase dashboard.

---

## 7️⃣ Environment Configuration

* All secrets stored in `.env` file on server.
* Managed locally (no in-app editing).

**Sample:**

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
META_APP_ID=
META_ACCESS_TOKEN=
META_WEBHOOK_VERIFY_TOKEN=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
PORT=8080
```

---

## 8️⃣ Deployment Steps

1. Provision VPS (Ubuntu 22+, Node 18+, PM2, Nginx).
2. Clone repo & install dependencies.
3. Configure `.env`.
4. Build React frontend.
5. Start PM2 process.
6. Configure Nginx reverse proxy with SSL.

---

## 9️⃣ Analytics Dashboard

**KPIs shown per campaign:**

* Total Contacts
* Sent, Delivered, Read, Failed
* Delivery Rate, Read Rate
* Avg Send Speed
* Start/End Time, Duration

Auto-refresh every 30 sec for active campaigns.

---

## 🔟 Authentication & Access Control

* **Authentication Method:** Supabase Email/Password Auth.
* **Single Admin Account:**
  * No signup page in application.
  * Admin account created manually via Supabase dashboard (one-time setup).
  * Only one admin user needed for MVP.
* **Session Management:**
  * JWT-based session tokens (Supabase-managed).
  * Session expiration: 1 hour with auto-refresh via Supabase client.
  * Backend validates JWT from `Authorization` header for all API routes.
* **Frontend:**
  * Login page only (no signup).
  * React Router guards all dashboard pages.
  * Uses `@supabase/supabase-js` for authentication.
* **Password Reset:** Uses Supabase's built-in email recovery flow.
* RLS disabled in v1.0.0; can be enabled for multi-user expansion.

---

## 1️⃣1️⃣ Timezone Handling

* **All application timezones:** IST (India Standard Time).
* **Scheduled campaign times:** Set in IST, stored as UTC in database (`timestamptz`).
* **Analytics timestamps:** Displayed in IST.
* **Daily reset logic:** Based on IST calendar day (midnight IST).
* **Cron jobs:** All time-based operations use IST.

---

## Logging & Versioning

* PM2 logs with 30-day retention.
* Version tags via Git (`v1.0.0`, etc.).
* Display version footer in app.

---

## ✅ Summary of Major Features

| Module                  | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| Multi-number management | Centralized control of all WhatsApp numbers                     |
| Template sync           | Auto + manual, quarantines Marketing templates                  |
| Bulk sending            | CSV upload, even split per template, sequential execution       |
| Adaptive throttling     | Dynamic learning per number                                     |
| LLM integration         | Contextual auto-replies using system prompt + 10 previous chats |
| Scheduler               | Time-based campaign execution                                   |
| Retry system            | 3 retries with exponential delay                                |
| Webhook ingestion       | Idempotent and fault-tolerant                                   |
| Inbox                   | Read-only conversation view                                     |
| Dashboard analytics     | Campaign-level KPIs                                             |
| Notification system     | In-app alerts for key events                                    |
| PM2 deployment          | Single VPS setup                                                |
| Supabase backup         | Auto daily snapshots                                            |
| Logging                 | PM2 logs + Supabase timestamps                                  |

---

**Status:** Finalized PRD (v1.2.0)

This document defines all core modules, behaviors, and configurations required for the WhatsApp Cloud API Automation App MVP.

**Changelog v1.2.0:**
- Added CSV processing details: parse and discard file, store all contacts in `campaign_contacts` table
- Added phone validation: 12 digits starting with 91 (India only)
- Added contact distribution logic: sequential chunks with equal split
- Added queue processing details: batch processing, row-level locking, stuck message recovery
- Updated template sync: pagination handling, global and per-number sync buttons
- Updated template categories: AUTHENTICATION also quarantined, manual un-quarantine only
- Added message retention: 90-day automatic cleanup
- Added status tracking hierarchy and out-of-order webhook handling
- Added real-time dashboard updates via Supabase Realtime
- Updated notifications: 30-day retention, pagination, click actions, real-time updates
- Added media handling: URLs only (no file uploads)

**Changelog v1.1.0:**
- Added detailed WhatsApp number onboarding process with Test Connection validation
- Clarified CSV variable mapping as user responsibility
- Specified LLM auto-reply rules (40 lifetime limit per customer, text messages only)
- Detailed adaptive rate control triggers and thresholds
- Added campaign scheduling pre-flight validation and IST timezone handling
- Updated authentication specification with Supabase Auth details
- Added notification types for all system events
- Specified timezone handling (IST) across entire application
