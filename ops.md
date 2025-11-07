# ⚙️ Operational Bundle — PM2, Cron, and Webhook Configuration

This document defines the **operations setup** for deploying and maintaining the WhatsApp Cloud API Automation App in production using PM2 on a single VPS.

---

## 1️⃣ PM2 Process Management

### **Installation**

```bash
npm install -g pm2
pm2 install pm2-logrotate
```

### **Environment Variables (.env)**

Create an `.env` file in the root directory:

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
META_APP_ID=
META_ACCESS_TOKEN=
META_WEBHOOK_VERIFY_TOKEN=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
TZ=Asia/Kolkata
```

**Notes:**
- `TZ=Asia/Kolkata` sets server timezone to IST for all time operations.
- `META_ACCESS_TOKEN` is typically a system user token for template sync (long-lived).
- Per-number access tokens are stored in database `whatsapp_numbers` table.

### **Start & Monitor Processes**

```bash
pm2 start server.js --name whatsapp-app
pm2 save
pm2 startup
```

### **Logs**

```bash
pm2 logs whatsapp-app
```

PM2 automatically creates:

```
~/.pm2/logs/whatsapp-app-out.log
~/.pm2/logs/whatsapp-app-error.log
```

Enable rotation:

```bash
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
```

---

## 2️⃣ Cron Jobs & Scheduled Tasks

### **Use Node-cron or PM2 Cron Restarts**

**Cron Worker (cron.js)** handles background tasks (all times in IST):

```js
import cron from 'node-cron';
import { syncTemplates, startScheduledCampaigns, refreshDailySummary } from './jobs.js';

cron.schedule('0 */3 * * *', syncTemplates);         // Every 3 hours
cron.schedule('* * * * *', startScheduledCampaigns); // Every minute (checks scheduled_start_time)
cron.schedule('0 0 * * *', refreshDailySummary);     // Midnight IST
```

**Campaign Scheduler Job Details:**
- Polls every minute for campaigns where `status='scheduled'` AND `scheduled_start_time <= NOW()`.
- **Pre-flight validation** before starting:
  - Check all selected templates: `is_active=true` AND `category != 'MARKETING'`.
  - Check WhatsApp number: `is_active=true`.
  - If validation fails: update campaign `status='failed'`, create notification, skip execution.
- Multiple campaigns on same number run sequentially (first come, first serve).

### **Start Cron Worker under PM2**

```bash
pm2 start cron.js --name whatsapp-cron
pm2 save
```

### **Monitoring Cron Jobs**

```bash
pm2 logs whatsapp-cron
```

---

## 3️⃣ Webhook Configuration

### **WhatsApp Webhook Endpoint**

Route: `/api/webhook/whatsapp`

Handles:

* Incoming user messages
* Delivery and read status updates

**Verification Step:**

* Meta sends a GET request with `hub.verify_token`.
* Backend compares token with `.env` variable `META_WEBHOOK_VERIFY_TOKEN`.

**Webhook Flow:**

1. Validate signature (`X-Hub-Signature-256`).
2. Parse event type (message or status).
3. Extract `whatsapp_message_id`.
4. Insert or update in `messages` or `message_status_logs` using idempotent logic.
5. **LLM Auto-Reply Logic (for incoming text messages only):**
   - Check message type: only process text messages (skip media, location, contacts).
   - Check reply limit: Query `user_reply_limits` table for customer phone number.
   - If `reply_count < 40`: Generate LLM reply immediately (synchronous).
   - If `reply_count >= 40`: Silent stop (no reply, no notification).
   - On successful reply: Increment `reply_count` in `user_reply_limits` table.
   - On LLM API failure: Log error and skip (no retry, no fallback message).
   - LLM context: system prompt (from WhatsApp number) + last 10 messages.
6. Return 200 OK to Meta (always, regardless of processing outcome).

**Idempotency Rule:**

* Before inserting any new message, check:

  ```sql
  SELECT 1 FROM messages WHERE whatsapp_message_id = $1;
  ```

  Skip if exists.

**Security:**

* Validate signature headers (`X-Hub-Signature-256`) from Meta.
* Reject any requests without matching hash.

---

## 4️⃣ Deployment Checklist

1. ✅ Create Supabase project and run database migrations (from database.md)
2. ✅ Create admin account in Supabase:
   - Go to Supabase Dashboard → Authentication → Users
   - Click "Add user" → Enter email/password
   - Confirm email manually or disable email confirmation for testing
3. ✅ Install Node.js 18+ and PM2 on VPS
4. ✅ Clone repository and install dependencies (`npm install`)
5. ✅ Configure `.env` with all required variables (including `TZ=Asia/Kolkata`)
6. ✅ Build frontend (`npm run build`)
7. ✅ Configure Nginx proxy (see section below)
8. ✅ Start PM2 processes (`server.js`, `cron.js`)
9. ✅ Test webhook endpoint with Meta verification
10. ✅ Add first WhatsApp number via UI (test "Test Connection" button)

---

## 5️⃣ Nginx Reverse Proxy Setup

### **Install Nginx & Certbot**

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

### **Nginx Config Example**

`/etc/nginx/sites-available/whatsapp-app`

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable HTTPS:

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-app /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo systemctl reload nginx
```

---

## 6️⃣ Adaptive Rate Control Implementation

### **Rate Adjustment Logic (Real-time during campaign execution)**

Implemented within campaign processor, not as separate cron:

**Increase Rate (+10%):**
- Trigger: Error rate < 1% for 5 continuous minutes
- Action: `max_send_rate_per_sec = max_send_rate_per_sec * 1.1`
- Ceiling: Never exceed 1000 msg/sec

**Decrease Rate (-20%):**
- Trigger: 3 consecutive messages fail with WhatsApp error code 130429 (rate limit)
- Action: `max_send_rate_per_sec = max_send_rate_per_sec * 0.8`
- Floor: Never go below 10 msg/sec

**Daily Reset (IST Calendar Day):**
- At start of first campaign of the day:
  - `max_send_rate_per_sec = last_stable_rate_per_sec * 0.9`
- Throughout day: rate adjusts up/down as usual, carry forward between campaigns
- At end of day (or last campaign): update `last_stable_rate_per_sec = current max_send_rate_per_sec`

**Storage:**
- Persist rate changes to `whatsapp_numbers` table every 5 minutes or on significant change
- Track in-memory: `current_rate`, `last_rate_change_time`, `consecutive_429_count`, `stable_success_duration`

### **Health Check Endpoint**

Route: `/api/health`
Returns:

```json
{
  "status": "ok",
  "uptime": 382910,
  "pm2_processes": 2,
  "pending_queue": 0
}
```

---

## 7️⃣ Analytics Refresh Job (Optional)

Nightly job updates the `daily_message_summary` materialized view.

```bash
supabase functions invoke refresh_daily_summary
```

Or via PM2 cron every midnight.

---

## 8️⃣ Backup & Restore

* Supabase handles **daily automatic backups** (no manual cron).
* To restore:

  * Go to Supabase → Project → Backups.
  * Select Restore Point or Clone.
  * Restart PM2 processes.

---

## 9️⃣ Monitoring & Alerts

* Check PM2 process health:

  ```bash
  pm2 list
  ```
* Review logs regularly:

  ```bash
  pm2 logs
  ```
* Optional: integrate PM2 Plus or UptimeRobot for uptime alerts.

---

## 🔟 Summary

| Component     | Responsibility                                   |
| ------------- | ------------------------------------------------ |
| PM2           | Run backend + cron jobs with auto-restart        |
| node-cron     | Template sync, campaign start, analytics refresh |
| Webhooks      | Handle inbound/outbound WhatsApp events          |
| Nginx + SSL   | Reverse proxy and HTTPS security                 |
| Supabase      | Database + backups                               |
| PM2 logrotate | Automatic log management                         |

**Status:** Finalized Ops Bundle v1.1.0

**Changelog v1.1.0:**
- Added `TZ=Asia/Kolkata` environment variable for IST timezone handling
- Added notes on META_ACCESS_TOKEN vs per-number access tokens
- Updated cron job schedules with IST clarification and campaign pre-flight validation details
- Added detailed webhook LLM auto-reply flow (40 limit check, text messages only, immediate processing)
- Expanded deployment checklist to include Supabase admin account creation and first WhatsApp number setup
- Replaced adaptive rate cron with real-time implementation details (increase/decrease triggers, floor/ceiling, daily reset)
- Added in-memory rate tracking metadata requirements
