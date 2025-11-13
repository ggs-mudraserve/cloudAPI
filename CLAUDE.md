# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **WhatsApp Cloud API Automation Platform** for large-scale template-based messaging and LLM-driven conversations. The platform connects multiple WhatsApp numbers under one Meta Business Account and manages campaigns, templates, conversations, and AI responses from a centralized dashboard.

**Tech Stack:**
- Backend: Node.js + Express
- Frontend: React + Tailwind CSS
- Database: Supabase (PostgreSQL)
- Process Manager: PM2
- APIs: WhatsApp Cloud API, OpenAI API
- Deployment: Single VPS with Nginx + Let's Encrypt

---

## 🔌 Connected MCP Servers

This project has access to specialized MCP (Model Context Protocol) servers. **Always use these tools when applicable** - they provide critical project-specific capabilities.

### Database Access (Self-Hosted Supabase)

**Important:** This project uses a self-hosted Supabase instance on the same VPS. Access the database using:

**Method 1: Supabase Client (Preferred)**
```javascript
const { supabase } = require('./src/config/supabase');
const { data, error } = await supabase.from('table_name').select('*');
```

**Method 2: Node.js Script**
```bash
node -e "
const { supabase } = require('./src/config/supabase');
(async () => {
  const { data, error } = await supabase.from('table_name').select('*');
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
})();
"
```

**CRITICAL REMINDERS:**
- ✅ Always verify table/column names with `database.md` documentation
- ✅ Use exact spelling (plural/singular matters: `campaigns` not `campaign`)
- ✅ Check foreign key relationships before queries
- ✅ Use transactions for multi-step operations

### Context7 MCP Server (For Coding)

**When to use:**
- When implementing new features with external libraries
- When you need up-to-date documentation for packages
- Before using unfamiliar APIs (WhatsApp Cloud API, OpenAI API, etc.)
- When encountering library-specific errors

**Available Tools:**
- `mcp__context7__resolve-library-id` - Find library ID
- `mcp__context7__get-library-docs` - Get documentation

**Workflow:**
```
1. resolve-library-id: "whatsapp-cloud-api" or "openai"
2. get-library-docs: Get latest syntax and examples
3. Implement using correct patterns
```

### Serena MCP Server (Codebase Navigation)

**When to use:**
- Finding files and symbols in the codebase
- Understanding code structure
- Navigating large codebases efficiently

**Note:** This project is currently documentation-only (no code yet), so Serena will be more useful once development begins.

---

## ⚠️ CRITICAL REMINDERS

**Before ANY database operation:**
1. ✅ Check `database.md` for exact table and column names
2. ✅ Use exact spelling (plural/singular matters)
3. ✅ Verify foreign key relationships
4. ✅ Use Node.js scripts with Supabase client for database queries

**Before implementing new features:**
1. ✅ Use Context7 MCP to get latest library documentation
2. ✅ Check for updated syntax and best practices
3. ✅ Avoid using outdated examples

**Common mistakes to avoid:**
- ❌ Assuming table names without checking database.md
- ❌ Using singular when table is plural (campaign vs campaigns)
- ❌ Forgetting underscores (campaign_contacts not campaigncontacts)
- ❌ Using old library syntax without checking docs
- ❌ Trying to use Supabase MCP (not available for self-hosted instances)

---

## Core Architecture Components

### 1. Multi-Number Management System
- **Adding Numbers:** UI form with fields: Display Name, Phone Number ID, Access Token, System Prompt
- **Test Connection Button:** Validates token via WhatsApp Cloud API before saving (mandatory step)
- **UI Actions:** Add and Delete only (no Edit functionality)
- **Token Expiration:** When API returns error 190, mark `is_active=false` and notify admin
- Each WhatsApp number operates independently with its own access token, phone_number_id, and system prompt
- Adaptive send-rate control per number (dynamically adjusts between 60-1000 msg/sec)
- **Initial Rate:** New numbers start at 60 msg/sec (both `max_send_rate_per_sec` and `last_stable_rate_per_sec`)
- Campaigns using the same number execute **sequentially**; across different numbers they run **in parallel**
- **Rate Adjustments:**
  - Increase +10%: Error rate < 1% for 5 continuous minutes
  - Decrease -20%: 3 consecutive 429 errors (WhatsApp error code 130429)
  - Floor: 10 msg/sec, Ceiling: 1000 msg/sec
  - Daily reset (IST calendar day): First campaign starts at 90% of previous day's final rate
  - Within same day: carry forward current rate between campaigns

### 2. Template Sync & Quarantine System
- Auto-sync templates every 3 hours from WhatsApp Cloud API
- **Critical**: Templates that change from UTILITY → MARKETING are automatically quarantined (disabled + hidden from campaign use)
- All category changes logged in `audit_template_changes` table
- Quarantine implemented via database trigger: `trg_detect_template_category_change`

### 3. Campaign Execution Flow
- **CSV Variable Mapping:** User responsibility to map CSV columns to template variables in correct order (no in-app mapping UI)
- CSV upload → Split contacts evenly among selected templates → Enqueue in `send_queue` → Process sequentially per number
- Queue states: `pending` → `ready` → `processing` → `sent` → `failed`
- Persistent queue survives restarts
- Retry policy: 3 attempts with exponential backoff (5s, 20s, 45s)
- **Scheduling (all times in IST timezone):**
  - Can start immediately or schedule for future time
  - Cron polls every minute for due campaigns
  - **Pre-flight validation:** Check templates are `is_active=true` AND `category != 'MARKETING'`
  - If validation fails: update status to `'failed'`, create notification, don't start
  - Admin can delete scheduled campaigns (no edit - must delete and recreate)
  - Multiple scheduled campaigns on same number run sequentially

### 4. Webhook Processing
- **Idempotent message insertion** using `whatsapp_message_id` as deduplication key
- Handles: incoming messages, delivery receipts, read receipts
- Validates Meta signatures via `X-Hub-Signature-256` header
- Separate tables: `messages` (content) and `message_status_logs` (delivery tracking)

### 5. LLM Integration & Auto-Reply Rules
- **Global OpenAI configuration:** Single key + model for entire app
- **Reply Processing:** Immediate/synchronous (in webhook handler, not queued)
- **Message Type Filter:** Only replies to incoming **text messages** (skip media, location, contacts)
- **40 Reply Lifetime Limit:**
  - Maximum 40 LLM replies per customer phone number (tracked in `user_reply_limits` table)
  - Counter is global across all WhatsApp numbers in system
  - After 40 replies: silent stop (no further auto-replies, no notification to customer)
  - No automatic reset (manual DB update if needed)
- **Reply Flow:**
  1. Check message type (text only)
  2. Query `user_reply_limits` for customer phone
  3. If `reply_count < 40`: Generate LLM reply
  4. If `reply_count >= 40`: Skip silently
  5. On success: Increment `reply_count` in DB
  6. On LLM API failure: Log error and skip (no retry, no fallback message)
- **LLM Context:** System prompt (from WhatsApp number) + last 10 messages per user
- **No rate limiting** on LLM calls (40 lifetime limit is the only restriction)
- No manual replies - all conversations handled by LLM
- System prompts stored per WhatsApp number

## Database Schema Key Points

### Critical Tables & Relationships
- `whatsapp_numbers` (1:N) → `templates`, `campaigns`, `messages`
- `campaigns` (1:N) → `send_queue`, `messages`
- `messages` (1:N) → `message_status_logs`
- `user_reply_limits` → standalone table tracking LLM reply count per customer phone (40 max)
- `templates` → UNIQUE constraint on (name, whatsapp_number_id)

### Performance Indexes
- Partial index on `send_queue.status='ready'` for fast queue polling
- Indexes on `created_at` for all high-write tables
- GIN indexes on JSONB columns (`components`, `payload`)

### Important Functions
- `upsert_template()`: Handles template sync with conflict resolution
- `detect_template_category_change()`: Trigger function for quarantine logic
- `refresh_daily_summary()`: Updates materialized view `daily_message_summary`

## Authentication & Access Control

**Single Admin System:**
- **Method:** Supabase Email/Password Auth
- **No Signup Page:** Admin account created manually via Supabase dashboard (one-time setup)
- **Session Management:** JWT tokens (Supabase-managed), 1-hour expiration with auto-refresh
- **Backend:** Validates `Authorization` header JWT for all API routes
- **Frontend:** Login page only, React Router guards, uses `@supabase/supabase-js`
- **Password Reset:** Supabase's built-in email recovery flow

## Development Commands

### Environment Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with:
# SUPABASE_URL, SUPABASE_SERVICE_KEY
# META_APP_ID, META_ACCESS_TOKEN, META_WEBHOOK_VERIFY_TOKEN
# OPENAI_API_KEY, OPENAI_MODEL
# PORT=8080
# TZ=Asia/Kolkata (IST timezone)
```

### Admin Account Creation
```bash
# One-time setup via Supabase Dashboard:
# 1. Go to Authentication → Users
# 2. Click "Add user" → Enter email/password
# 3. Confirm email manually or disable email confirmation for testing
```

### Running Locally
```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

### PM2 Deployment
```bash
# Start main server
pm2 start server.js --name whatsapp-app

# Start cron worker
pm2 start cron.js --name whatsapp-cron

# Save PM2 configuration
pm2 save
pm2 startup

# Monitor logs
pm2 logs whatsapp-app
pm2 logs whatsapp-cron
```

### Cron Jobs (via node-cron, all times in IST)
- Template sync: Every 3 hours (`0 */3 * * *`)
- Campaign scheduler: Every minute (`* * * * *`)
  - Checks for `scheduled_start_time <= NOW()` AND `status='scheduled'`
  - Pre-flight validation: templates active & not MARKETING, number active
  - If validation fails: set status to 'failed', notify admin
- Daily summary refresh: Midnight IST (`0 0 * * *`)

## Timezone Handling

**All application times use IST (India Standard Time):**
- Set via `TZ=Asia/Kolkata` in `.env`
- Scheduled campaign times: displayed and set in IST, stored as UTC in database
- Daily rate reset: Based on IST calendar day (midnight IST)
- Analytics timestamps: Displayed in IST
- All cron jobs operate on IST schedule

## Security Considerations

### Webhook Security
- Always validate Meta webhook signatures before processing events
- Use crypto comparison for `META_WEBHOOK_VERIFY_TOKEN`
- Implement request deduplication via `whatsapp_message_id`

### Rate Limiting
- Never exceed `max_send_rate_per_sec` stored in `whatsapp_numbers` table
- Respect WhatsApp's tier limits (messaging tier stored per number)
- Handle 429 errors gracefully with adaptive backoff

### Data Protection
- Store access tokens encrypted in Supabase
- Never log sensitive data (tokens, API keys)
- Use Supabase RLS if implementing multi-tenant access

## Campaign Logic

### Sequential Execution Per Number
When a campaign uses a single WhatsApp number with multiple templates:
1. Split contacts evenly among templates
2. Create separate queue batches per template
3. Process batches **sequentially** (one template completes before next starts)
4. Within each batch, send at adaptive rate (respecting `max_send_rate_per_sec`)

### Stop/Resume Functionality
- Stop: Update campaign status to `paused`, halt queue processing
- Resume: Update status to `running`, continue from last processed message
- Queue state persists in `send_queue` table

## Frontend Dashboard Sections

1. **Login**: Email/password only (no signup page)
2. **Home**: Campaign summary cards, active campaigns count
3. **Campaigns**: Create, monitor, stop/resume, delete scheduled campaigns
4. **Inbox**: Read-only conversation view (all messages, search/filter)
5. **Templates**: List with quarantine status indicator, manual sync button
6. **WhatsApp Numbers**: Add/Delete numbers with "Test Connection" validation
7. **Settings**: Global LLM configuration (API key, model), system prompts per number
8. **Notifications**: In-app alerts bell icon showing:
   - Campaign completed/stopped
   - Campaign failed (template validation failure)
   - Template quarantined (category changed to MARKETING)
   - WhatsApp number token expired

## Important Implementation Notes

### Message Idempotency
Always check for existing `whatsapp_message_id` before inserting:
```sql
SELECT 1 FROM messages WHERE whatsapp_message_id = $1;
```

### Adaptive Rate Persistence
After successful campaign completion:
- Store final stable rate in `last_stable_rate_per_sec`
- Next day: resume at 90% of last stable rate
- Prevents cold-start throttling issues

### Template Component Parsing
- Templates stored as JSONB in `components` column
- Parse header/body/footer/buttons from Cloud API format
- Extract variable placeholders for CSV mapping

### CSV Format Requirements
- **User Responsibility:** Users must map CSV columns to template variables in correct order (no in-app UI for mapping)
- First column: Phone number (with country code)
- Remaining columns: Map to template variables in sequential order
- Column format: `Phone,{{Media}},{{1}},{{2}},...`
- Support for media URLs in dedicated column
- No validation of column count vs template requirements (fails at send-time if mismatch)

## Monitoring & Debugging

### Health Check Endpoint
```
GET /api/health
Returns: { status, uptime, pm2_processes, pending_queue }
```

### Key Metrics to Track
- Delivery rate: `delivered_count / sent_count`
- Read rate: `read_count / delivered_count`
- Average send speed: `total_sent / duration_seconds`
- Retry ratio: `retried_messages / total_messages`

### Common Issues
- **429 Errors**: System auto-reduces rate by 20% after 3 consecutive errors (floor: 10 msg/sec)
- **Template Not Found**: Run manual sync, check template status in Meta dashboard
- **Webhook Failures**: Verify signature validation, check nginx logs for request drops
- **LLM Silent Stop**: Check `user_reply_limits` table - customer may have hit 40 reply limit
- **Campaign Failed Before Start**: Check notifications - likely template quarantined or became MARKETING
- **Token Expired**: Check notifications and `whatsapp_numbers.is_active` - need to update access token

## Critical Implementation Rules

**Must Follow:**
1. **Always validate JWT** from Supabase before processing any API request
2. **Always check `whatsapp_message_id` uniqueness** before inserting messages (idempotency)
3. **Always check `user_reply_limits`** before generating LLM replies (40 limit enforcement)
4. **Always validate template status** (is_active=true, category!='MARKETING') before starting campaigns
5. **Always validate WhatsApp signature** (`X-Hub-Signature-256`) on webhook requests
6. **Never exceed** `max_send_rate_per_sec` from database when sending messages
7. **Never log** access tokens, API keys, or sensitive user data
8. **Return 200 OK** to Meta webhooks regardless of processing outcome (prevents retries)
9. **Persist rate changes** to database periodically (every 5 min or on change)
10. **Use IST timezone** for all user-facing timestamps and scheduling logic

**Data Integrity:**
- Use transactions for multi-step operations (campaign creation with queue insertion)
- Handle race conditions on `send_queue` processing (row-level locking)
- Ensure `user_reply_limits` increment is atomic (use UPDATE with WHERE clause)

## Deployment Architecture

Single VPS setup:
- **Nginx**: Reverse proxy (port 80/443 → 8080)
- **PM2**: Process management (main server + cron worker)
- **Node.js**: Backend API and webhook handlers
- **React**: Frontend (served as static build via Express)
- **Supabase**: External managed database + auth

## Version Control

- Version tags: `v1.0.0`, `v1.1.0`, etc.
- Display version in app footer
- PM2 logs with 30-day retention (via pm2-logrotate)

---

**Document Version:** v1.2.0

**Changelog v1.2.0:**
- **Added MCP Servers section** - Critical guidance on using Supabase MCP for database operations
- Added workflow for verifying table names before queries (prevent typos and errors)
- Added Context7 MCP usage for getting up-to-date library documentation
- Added Serena MCP usage for codebase navigation
- Added critical reminders section with common mistakes to avoid
- Emphasized importance of using `mcp__supabase__list_tables` before ANY database operation

**Changelog v1.1.0:**
- Added detailed WhatsApp number onboarding (UI form, Test Connection, Add/Delete only)
- Added authentication section (Supabase Auth, single admin, no signup)
- Added LLM auto-reply rules (40 lifetime limit, text messages only, immediate processing)
- Added timezone handling section (IST across entire application)
- Updated adaptive rate control with exact triggers (increase: <1% error for 5 min, decrease: 3 consecutive 429s)
- Added campaign scheduling pre-flight validation and IST timezone details
- Added CSV variable mapping clarification (user responsibility)
- Updated frontend sections to include all dashboard pages and notification types
- Added Critical Implementation Rules section
- Updated common issues with new troubleshooting scenarios
- Added admin account creation steps
- Clarified token expiration handling and notification system
