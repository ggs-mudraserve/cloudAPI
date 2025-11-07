# Implementation Progress Tracker

**Last Updated:** 2025-11-06 (Session 3)
**Current Phase:** Phase 11 Complete - Inbox & Conversations Operational

---

## Overall Progress

**Completed:** 11/17 phases (65%)
**Remaining:** 6 phases

---

## Phase Checklist

### ✅ Phase 1: Project Foundation & Setup (COMPLETE)
- [x] Create backend and frontend folder structure
- [x] Initialize backend package.json with dependencies
- [x] Initialize frontend package.json with dependencies
- [x] Create .env.example for backend
- [x] Create .env.example for frontend
- [x] Create PM2 ecosystem configuration
- [x] Set up Supabase client utilities
- [x] Create Express server with middleware
- [x] Create .gitignore
- [x] Create README.md

**Testing:** ✅ Can verify file structure is created

---

### ✅ Phase 2: Authentication System (COMPLETE)
- [x] Create backend auth controller (login/logout/verify)
- [x] Create backend auth routes
- [x] Integrate auth routes in Express server
- [x] Create frontend auth context
- [x] Create frontend API service with axios
- [x] Create login page component
- [x] Create dashboard page component
- [x] Create protected route wrapper
- [x] Set up React Router with routes
- [x] Configure Vite, Tailwind, PostCSS

**Testing:** ✅ See instructions below in "What You Can Test Now" section

---

### ✅ Phase 3: WhatsApp Numbers Management (COMPLETE)
- [x] Create backend controller for WhatsApp numbers
- [x] Create WhatsApp Cloud API service utility
- [x] Create backend routes (GET, POST, DELETE)
- [x] Create test connection endpoint
- [x] Integrate routes in Express server
- [x] Create frontend WhatsApp Numbers page
- [x] Create Add Number form component
- [x] Create Test Connection button
- [x] Create Numbers list component
- [x] Create Delete confirmation modal
- [x] Add navigation to WhatsApp Numbers page

**Testing:** ✅ See "What You Can Test Now (After Phase 3)" section below

---

### ✅ Phase 4: Template Sync System (COMPLETE)
- [x] Create template sync service
- [x] Handle WhatsApp API pagination (>100 templates)
- [x] Implement upsert_template database function usage
- [x] Create backend routes (sync-all, sync/:numberId)
- [x] Create template management routes (list, unquarantine)
- [x] Create frontend Templates page
- [x] Create template list with status badges
- [x] Create sync buttons (global and per-number)
- [x] Create quarantine indicator
- [x] Create template history modal
- [x] Create audit trail viewer

**Testing:** ✅ See "What You Can Test Now (After Phase 4)" section below

---

### ✅ Phase 5: Campaign Creation & CSV Processing (COMPLETE)
- [x] Create CSV upload endpoint with multipart/form-data
- [x] Implement CSV parsing logic
- [x] Implement phone validation (12 digits, starts with 91)
- [x] Store all contacts in campaign_contacts table
- [x] Implement contact distribution logic
- [x] Create campaign routes (list, create, get details)
- [x] Create frontend Campaign Creation page
- [x] Create CSV upload component
- [x] Create template selection component
- [x] Create validation summary display
- [x] Create campaign list component

**Testing:** ✅ See "What You Can Test Now (After Phase 5)" section below

---

### ✅ Phase 6: Campaign Scheduling & Pre-flight Validation (COMPLETE)
- [x] Create campaign scheduler cron job
- [x] Implement pre-flight validation logic
- [x] Create notification on validation failure
- [x] Create campaign management routes (stop, resume, delete)
- [x] Create notification routes and controller
- [x] Create notification helper functions
- [x] Update ecosystem.config.js for PM2 cron worker
- [x] Campaign scheduler runs every minute
- [x] Pre-flight validation checks templates and WhatsApp number status
- [x] Failed campaigns create notifications

**Testing:** ✅ See "What You Can Test Now (After Phase 6)" section below

---

### ✅ Phase 7: Queue Processing & Adaptive Rate Control (COMPLETE)
- [x] Create queue processor worker (queueProcessor.js)
- [x] Implement FOR UPDATE SKIP LOCKED logic (via SQL queries)
- [x] Implement adaptive rate control algorithm
- [x] Create rate increase logic (+10% when error < 1%)
- [x] Create rate decrease logic (-20% after 3x 429 errors)
- [x] Implement daily reset logic (IST) - framework ready
- [x] Create sequential execution manager
- [x] Create retry logic with exponential backoff (5s, 20s, 45s)
- [x] Persist rate changes to database
- [x] Integrate queue processor with server.js (auto-starts)
- [x] Update sendTemplateMessage for proper WhatsApp API calls
- [x] Add database functions (increment_campaign_sent, increment_campaign_failed)
- [x] Add missing send_queue columns (next_retry_at, sent_at, whatsapp_message_id)
- [x] Test with real campaign (2/2 messages sent successfully)

**Testing:** ✅ See "What You Can Test Now (After Phase 7)" section below

---

### ✅ Phase 8: Webhook Handlers (COMPLETE)
- [x] Create webhook verification endpoint (GET)
- [x] Create webhook POST handler (POST)
- [x] Implement Meta signature verification (HMAC SHA256)
- [x] Implement idempotency check (whatsapp_message_id)
- [x] Handle incoming messages
- [x] Handle status updates (sent/delivered/read/failed)
- [x] Implement status hierarchy logic (sent < delivered < read, failed always updates)
- [x] Insert into messages and message_status_logs tables
- [x] Handle duplicate webhooks gracefully
- [x] Always return 200 to Meta to prevent retries
- [x] Process webhooks asynchronously after responding

**Testing:** ✅ See "What You Can Test Now (After Phase 8)" section below

---

### ✅ Phase 9: LLM Integration & Auto-Reply (COMPLETE)
- [x] Create auto-reply trigger in webhook
- [x] Implement user_reply_limits check (40 limit)
- [x] Fetch last 10 messages for context
- [x] Integrate OpenAI API
- [x] Generate reply with system prompt
- [x] Send reply via WhatsApp API
- [x] Increment reply_count in database
- [x] Handle LLM failures silently (no retry, no fallback)
- [x] Only reply to text messages (skip media, location, etc.)
- [x] Immediate/synchronous reply processing
- [x] Context-aware responses using conversation history
- [x] Silent stop after 40 replies reached

**Testing:** ✅ See "What You Can Test Now (After Phase 9)" section below

---

### ✅ Phase 10: Frontend Dashboard & Campaign UI (COMPLETE)
- [x] Create dashboard home page with real-time stats
- [x] Create campaign summary cards (active, sent, failed)
- [x] Create campaigns page with list (already existed from Phase 5)
- [x] Create campaign creation form (already existed from Phase 5)
- [x] Integrate Supabase Realtime for live updates
- [x] Create notifications bell icon with dropdown
- [x] Display unread notification count
- [x] Mark notifications as read functionality
- [x] Click notification to navigate to relevant page
- [x] Real-time notification updates
- [x] Loading states and error handling
- [x] Responsive design with Tailwind CSS

**Testing:** ✅ Dashboard loads with real-time stats and notifications

---

### ✅ Phase 11: Inbox & Conversations (COMPLETE)
- [x] Create backend messages routes
- [x] Create conversation grouping logic
- [x] Implement filters (date, number, search)
- [x] Create frontend Inbox page
- [x] Create conversation list component
- [x] Create message thread viewer
- [x] Create search and filter controls
- [x] Create reply limit indicator

**Testing:** ✅ Navigate to /inbox to view all conversations

---

### ⬜ Phase 12: Notifications System
- [ ] Create notification helper functions
- [ ] Create notification routes (list, mark read, read all)
- [ ] Create frontend notifications UI
- [ ] Create bell icon with badge
- [ ] Create notification dropdown
- [ ] Implement click-to-navigate
- [ ] Create notification types for all events

**Testing:** Not yet available

---

### ⬜ Phase 13: Real-time Updates
- [ ] Set up Supabase Realtime subscriptions
- [ ] Subscribe to campaigns table changes
- [ ] Subscribe to notifications table inserts
- [ ] Update UI on database changes
- [ ] Implement fallback to 30s polling
- [ ] Test real-time updates in UI

**Testing:** Not yet available

---

### ⬜ Phase 14: Cron Jobs & Background Workers
- [ ] Create template sync cron (every 3 hours)
- [ ] Create campaign scheduler cron (every 1 minute)
- [ ] Create stuck message recovery cron (every 5 minutes)
- [ ] Create cleanup cron for messages (90-day retention)
- [ ] Create cleanup cron for notifications (30-day retention)
- [ ] Create daily summary refresh cron (midnight IST)
- [ ] Create cron.js worker file
- [ ] Test all cron jobs

**Testing:** Not yet available

---

### ⬜ Phase 15: Settings & System Configuration
- [ ] Create settings backend routes
- [ ] Create global LLM settings page
- [ ] Create system prompt editor per number
- [ ] Create version display in footer
- [ ] Test settings updates

**Testing:** Not yet available

---

### ⬜ Phase 16: Error Handling & Health Check
- [ ] Enhance health check endpoint
- [ ] Create global error handler
- [ ] Add proper HTTP status codes
- [ ] Add error logging to PM2
- [ ] Test error scenarios

**Testing:** Not yet available

---

### ⬜ Phase 17: Testing & Deployment Prep
- [ ] Test WhatsApp API integration
- [ ] Test CSV upload with large files
- [ ] Test queue processing and rate control
- [ ] Test webhook signature validation
- [ ] Test LLM reply generation
- [ ] Build frontend for production
- [ ] Configure Nginx reverse proxy
- [ ] Set up SSL with Let's Encrypt
- [ ] Deploy to VPS
- [ ] Configure environment variables
- [ ] Start PM2 processes
- [ ] Monitor logs and verify deployment

**Testing:** Full end-to-end testing

---

## What You Can Test Now (After Phase 2)

### Prerequisites
1. **Install Supabase CLI or use Supabase Dashboard** to create admin user
2. **Install dependencies:**
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd frontend
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   # Backend: backend/.env
   cp backend/.env.example backend/.env
   ```
   Edit `backend/.env`:
   ```
   PORT=8080
   NODE_ENV=development
   TZ=Asia/Kolkata
   SUPABASE_URL=https://facxofxojjfqvpxmyavl.supabase.co
   SUPABASE_SERVICE_KEY=your-service-key-here
   ```

   ```bash
   # Frontend: frontend/.env
   cp frontend/.env.example frontend/.env
   ```
   Edit `frontend/.env`:
   ```
   VITE_API_URL=http://localhost:8080/api
   VITE_SUPABASE_URL=https://facxofxojjfqvpxmyavl.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

4. **Create admin user in Supabase:**
   - Go to: https://supabase.com/dashboard/project/facxofxojjfqvpxmyavl/auth/users
   - Click "Add user" → "Create new user"
   - Enter email: `admin@example.com`
   - Enter password: `your-secure-password`
   - Uncheck "Auto Confirm User" or manually confirm via email
   - Click "Create user"

### Running the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Expected output:
```
✅ Supabase connection established
🚀 WhatsApp Cloud API Server started
📡 Server running on port 8080
🌍 Environment: development
⏰ Timezone: Asia/Kolkata
✅ Ready to accept requests
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Expected output:
```
VITE v5.0.8  ready in XXX ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

### Test Authentication Flow

1. **Open browser:** http://localhost:3000
   - Should automatically redirect to `/login`

2. **Login Page:**
   - Enter the admin credentials you created in Supabase
   - Email: `admin@example.com`
   - Password: `your-secure-password`
   - Click "Sign in"

3. **Expected Result:**
   - Should redirect to `/dashboard`
   - Should see:
     - Header with "WhatsApp Cloud API Platform"
     - Welcome message with your email
     - Logout button
     - Dashboard content with placeholder cards showing "0" for:
       - WhatsApp Numbers
       - Templates
       - Campaigns

4. **Test Logout:**
   - Click "Logout" button
   - Should redirect back to `/login`
   - Session should be cleared

5. **Test Protected Routes:**
   - After logging out, try accessing: http://localhost:3000/dashboard
   - Should automatically redirect to `/login`

6. **Test Invalid Credentials:**
   - Enter wrong email/password
   - Should see error message: "Invalid email or password"

7. **Backend Health Check:**
   - Open: http://localhost:8080/api/health
   - Should see JSON response with:
     ```json
     {
       "status": "ok",
       "uptime": 123.456,
       "timestamp": "2025-11-06T...",
       "environment": "development",
       "timezone": "Asia/Kolkata"
     }
     ```

### Troubleshooting

**If login fails:**
- Check backend logs in Terminal 1
- Verify Supabase credentials in `.env`
- Verify admin user is created and email is confirmed
- Check browser console for errors (F12)

**If frontend doesn't load:**
- Check frontend logs in Terminal 2
- Verify Vite proxy is working
- Check browser console for errors

**If "Unauthorized" error:**
- Check JWT token in browser localStorage
- Verify Supabase service key is correct
- Try logout and login again

---

## Success Criteria for Phase 2

✅ Backend server starts without errors
✅ Frontend dev server starts without errors
✅ Can access login page at http://localhost:3000
✅ Can login with valid credentials
✅ Redirects to dashboard after successful login
✅ Dashboard displays welcome message with user email
✅ Can logout successfully
✅ Protected routes redirect to login when not authenticated
✅ Health check endpoint returns valid response

---

## What You Can Test Now (After Phase 3)

### Prerequisites
- Complete Phase 2 setup
- Have Meta Business Account credentials ready
- Get WhatsApp Business App ID from Meta Dashboard
- Get Access Token and Phone Number ID for at least one WhatsApp number

### Test WhatsApp Numbers Management

1. **Navigate to WhatsApp Numbers:**
   - From dashboard, click the "WhatsApp Numbers" card
   - Should redirect to `/whatsapp-numbers`

2. **Add New Number:**
   - Click "Add WhatsApp Number" button
   - Fill in the form:
     - Display Name: `Test Number`
     - Phone Number ID: `Your-Phone-Number-ID`
     - Access Token: `Your-Access-Token`
     - System Prompt: `You are a helpful customer support assistant`
   - Click "Test Connection" button
   - Should see success message: "Connection successful!"
   - Click "Add Number" button
   - Should see success message and number appears in list

3. **View Numbers List:**
   - Should see your added number with:
     - Display name
     - Phone number (fetched from API)
     - Active status (green badge)
     - Delete button

4. **Delete Number:**
   - Click "Delete" button on a number
   - Confirm deletion in the alert
   - Number should be removed from list

5. **Test Invalid Token:**
   - Try adding a number with invalid access token
   - Click "Test Connection"
   - Should see error message: "Connection failed"
   - "Add Number" button should remain disabled

### Success Criteria for Phase 3

✅ Can navigate to WhatsApp Numbers page
✅ Can add new WhatsApp number with valid credentials
✅ Test Connection validates token before saving
✅ Can view list of all connected numbers
✅ Can delete numbers with confirmation
✅ Active/inactive status displays correctly
✅ Error handling works for invalid credentials

---

## What You Can Test Now (After Phase 4)

### Prerequisites
- Complete Phase 3 setup
- Have at least one WhatsApp number added
- Ensure the WhatsApp number has templates in Meta Business Manager

### Test Template Sync System

1. **Navigate to Templates:**
   - From dashboard, click the "Templates" card
   - Should redirect to `/templates`

2. **Sync All Templates:**
   - Click "Sync All" button in the top right
   - Should see loading spinner
   - Should see success message showing:
     - Total synced
     - Inserted count
     - Updated count
     - Quarantined count
   - Templates should appear in the list

3. **View Templates List:**
   - Each template should display:
     - Template name
     - Category badge (UTILITY-green, MARKETING-red, AUTHENTICATION-yellow)
     - Status badge (APPROVED, PENDING, REJECTED)
     - Quarantine warning (if applicable)
     - Active/Inactive status
     - WhatsApp number name
     - Language
     - Last synced timestamp

4. **Filter Templates:**
   - **By WhatsApp Number:**
     - Select a number from dropdown
     - Only templates for that number should display
   - **By Category:**
     - Select UTILITY from dropdown
     - Only UTILITY templates should display
   - **Show Quarantined Only:**
     - Check the checkbox
     - Only quarantined templates should display
   - Click "Refresh" to reload with filters

5. **Sync by Number:**
   - Scroll to "Sync by Number" section
   - Click "Sync" button on a specific number
   - Should see "Syncing..." state
   - Should see success message with sync results

6. **View Template History:**
   - Click "History" button on any template
   - Modal should open showing:
     - Template name
     - Timeline of category changes
     - Old and new categories with colors
     - Quarantine indicators
     - Timestamps
   - Click "Close" to dismiss modal

7. **Un-quarantine Template (if UTILITY):**
   - Find a quarantined UTILITY template
   - Click "Un-quarantine" button
   - Confirm in the alert
   - Template should update (quarantine badge removed)
   - Should see success message

8. **Test Auto-Quarantine:**
   - In Meta Business Manager, change a template category from UTILITY to MARKETING
   - In the app, click "Sync All"
   - That template should now show:
     - Red MARKETING badge
     - Orange "⚠️ Quarantined" badge
   - Click "History" on that template
   - Should see the category change recorded with quarantine indicator

### Success Criteria for Phase 4

✅ Can navigate to Templates page
✅ Can sync all templates from all WhatsApp numbers
✅ Can sync templates for specific number
✅ Templates display with correct badges and status
✅ Can filter templates by number, category, and quarantine status
✅ Can view template history showing category changes
✅ Can un-quarantine UTILITY templates
✅ Auto-quarantine works for MARKETING/AUTHENTICATION categories
✅ Pagination handles >100 templates correctly
✅ Success/error messages display appropriately

---

## What You Can Test Now (After Phase 5)

### Prerequisites
- Complete Phase 4 setup
- Have at least one active WhatsApp number
- Have at least one APPROVED UTILITY template (not quarantined)
- Prepare a CSV file with contact data

### CSV File Format
Create a test CSV file with this format:
```csv
Phone,Variable1,Variable2
919876543210,John,Offer123
919876543211,Jane,Offer456
918765432109,Bob,Offer789
```

**Important:**
- First column: Phone number (exactly 12 digits starting with 91)
- Remaining columns: Template variables in order
- No headers required in actual CSV

### Test Campaign Creation & Management

1. **Navigate to Campaigns:**
   - From dashboard, click the "Campaigns" card
   - Should redirect to `/campaigns`

2. **Create Campaign:**
   - Click "+ Create Campaign" button
   - Fill in the form:
     - Campaign Name: `Test Campaign 1`
     - WhatsApp Number: Select your number
     - Templates: Check one or more UTILITY templates
     - CSV File: Upload your test CSV
     - Schedule: Leave unchecked for immediate execution
   - Click "Create Campaign"
   - Should see success message with:
     - Total valid contacts
     - Invalid contacts count (if any)
   - Campaign should appear in the list

3. **View Campaign List:**
   - Each campaign should display:
     - Campaign name
     - Status badge (SCHEDULED, RUNNING, PAUSED, COMPLETED, FAILED)
     - WhatsApp number name
     - Template names
     - Total contacts (with invalid count if any)
     - Sent/Failed counts
     - Start time
   - Status colors:
     - SCHEDULED: Blue
     - RUNNING: Green
     - PAUSED: Yellow
     - COMPLETED: Gray
     - FAILED: Red

4. **Filter Campaigns:**
   - **By WhatsApp Number:**
     - Select a number from dropdown
     - Only campaigns for that number should display
   - **By Status:**
     - Select a status from dropdown
     - Only campaigns with that status should display
   - Click "Refresh" to reload

5. **Stop Running Campaign:**
   - Find a campaign with RUNNING status
   - Click "Stop" button
   - Campaign status should change to PAUSED
   - Should see success message

6. **Resume Paused Campaign:**
   - Find a campaign with PAUSED status
   - Click "Resume" button
   - Campaign status should change to RUNNING
   - Should see success message

7. **Delete Campaign:**
   - Find a campaign with SCHEDULED, COMPLETED, or FAILED status
   - Click "Delete" button
   - Confirm deletion
   - Campaign should be removed from list
   - Should see success message

8. **Test Scheduled Campaign:**
   - Click "+ Create Campaign"
   - Fill in all fields
   - Check "Schedule for later"
   - Select a future date/time (IST timezone)
   - Click "Create Campaign"
   - Campaign should appear with SCHEDULED status
   - Can delete scheduled campaigns before they start

9. **Test Invalid CSV:**
   - Create CSV with invalid phone numbers (e.g., only 10 digits)
   - Upload in campaign creation
   - Should see invalid contacts count in success message
   - Valid contacts should still be processed

10. **Test Template Validation:**
    - Try creating campaign with MARKETING template (should fail)
    - Try creating campaign with quarantined template (should fail)
    - Should see error message about ineligible templates

### Success Criteria for Phase 5

✅ Can navigate to Campaigns page
✅ Can create campaign with CSV upload
✅ Phone validation works (12 digits starting with 91)
✅ Contacts are distributed evenly among selected templates
✅ Invalid contacts are counted and reported
✅ Can filter campaigns by number and status
✅ Can view campaign list with all details
✅ Can stop running campaigns
✅ Can resume paused campaigns
✅ Can delete scheduled/completed/failed campaigns
✅ Can schedule campaigns for future execution
✅ Template validation works (only APPROVED UTILITY allowed)
✅ Success/error messages display appropriately

### Database Verification (Optional)

You can verify data in Supabase:

1. **campaigns table:**
   - Check campaign records are created
   - Verify status, total_contacts, template_names

2. **campaign_contacts table:**
   - Check all contacts are stored (both valid and invalid)
   - Verify is_valid flag
   - Verify template_name assignment

3. **send_queue table:**
   - For non-scheduled campaigns, check messages are enqueued
   - Verify status is 'ready'
   - Verify payload contains variables

---

## What You Can Test Now (After Phase 7)

### Prerequisites
- Complete Phase 5 setup
- Have at least one active WhatsApp number
- Have at least one APPROVED UTILITY template
- Backend server running with queue processor

### Database Migrations Required

**IMPORTANT:** Before testing, run these migrations in Supabase SQL Editor:

```sql
-- Migration 1: Add campaign counter functions
CREATE OR REPLACE FUNCTION increment_campaign_sent(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE campaigns
  SET total_sent = total_sent + 1
  WHERE id = _campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_campaign_failed(_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE campaigns
  SET total_failed = total_failed + 1
  WHERE id = _campaign_id;
END;
$$;

-- Migration 2: Add missing columns to send_queue
ALTER TABLE send_queue
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS sent_at timestamptz,
ADD COLUMN IF NOT EXISTS whatsapp_message_id text;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_send_queue_next_retry
ON send_queue(next_retry_at)
WHERE status = 'ready' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_send_queue_sent_at
ON send_queue(sent_at)
WHERE sent_at IS NOT NULL;
```

### Test Queue Processing & Message Sending

1. **Start Backend with Queue Processor:**
   ```bash
   cd backend
   npm run dev
   ```
   - Should see in logs:
     ```
     🚀 WhatsApp Cloud API Server started
     🔄 Starting queue processor...
     ✅ Queue processor started
     ```

2. **Create Test Campaign:**
   - Go to Campaigns page
   - Click "+ Create Campaign"
   - Fill in details:
     - Name: `Queue Test 1`
     - WhatsApp Number: Select your number
     - Templates: Select one template (e.g., hello_world)
     - CSV: Upload 2-3 valid phone numbers
     - Leave "Schedule for later" unchecked
   - Click "Create Campaign"
   - Campaign should show:
     - Status: RUNNING (green)
     - Sent/Failed: 0/0 initially

3. **Watch Queue Processing (Backend Logs):**
   - Within 5 seconds, you should see:
     ```
     [Queue] Found 1 running campaigns
     [Queue] Processing 2 messages for campaign <id> at 60 msg/sec
     [Queue] Sent message <id> to 919876543210
     [Queue] Sent message <id> to 919876543211
     [Queue] Checking if campaign <id> is complete...
     [Queue] Marking campaign <id> as completed...
     [Queue] ✅ Campaign completed successfully
     ```

4. **Verify Campaign Completion:**
   - Refresh Campaigns page
   - Campaign should now show:
     - Status: COMPLETED (gray)
     - Sent/Failed: 2/0 (or X/Y based on your CSV)
   - Check WhatsApp on the recipient phones - messages should arrive

5. **Test Adaptive Rate Control:**
   - Create larger campaign (10+ contacts)
   - Watch logs for rate adjustments
   - Initial rate: 60 msg/sec
   - If successful, rate increases +10% after 5 minutes of <1% errors
   - If rate limited, rate decreases -20% after 3 consecutive 429 errors

6. **Test Retry Logic:**
   - Use an invalid phone number in CSV (e.g., 910000000000)
   - Watch logs:
     ```
     [Queue] Message <id> scheduled for retry 1/3 in 5000ms
     [Queue] Message <id> scheduled for retry 2/3 in 20000ms
     [Queue] Message <id> scheduled for retry 3/3 in 45000ms
     [Queue] Message <id> failed after 3 attempts
     ```
   - Campaign should show: Sent/Failed: X/1

7. **Test Sequential Execution:**
   - Create 2 campaigns using the SAME WhatsApp number
   - Both should start with RUNNING status
   - Only one should process at a time (check logs)
   - Second campaign starts after first completes

8. **Test Parallel Execution:**
   - If you have 2 WhatsApp numbers:
     - Create campaign on Number 1
     - Create campaign on Number 2
     - Both should process simultaneously (check logs)

9. **Test Stop/Resume:**
   - Create a campaign with many contacts
   - Click "Stop" while RUNNING
   - Status changes to PAUSED
   - Queue processor stops sending
   - Click "Resume"
   - Status changes back to RUNNING
   - Queue processor continues from where it stopped

### Verify Database Updates

Check in Supabase:

1. **send_queue table:**
   ```sql
   SELECT status, COUNT(*)
   FROM send_queue
   WHERE campaign_id = '<your-campaign-id>'
   GROUP BY status;
   ```
   - Should show: `sent: X` for successful messages

2. **campaigns table:**
   ```sql
   SELECT name, status, total_sent, total_failed
   FROM campaigns
   WHERE name LIKE 'Queue Test%';
   ```
   - Should show accurate sent/failed counts

3. **whatsapp_numbers table:**
   ```sql
   SELECT display_name, max_send_rate_per_sec, last_stable_rate_per_sec
   FROM whatsapp_numbers;
   ```
   - Rates should update as campaigns run

### Success Criteria for Phase 7

✅ Backend starts with queue processor running
✅ Queue processor polls every 5 seconds for running campaigns
✅ Messages are sent via WhatsApp API successfully
✅ Campaign counters (sent/failed) update in real-time
✅ Campaigns auto-complete when all messages sent
✅ Retry logic works (3 attempts with exponential backoff)
✅ Adaptive rate control adjusts sending speed
✅ Sequential execution works (same number)
✅ Parallel execution works (different numbers)
✅ Stop/Resume functionality works
✅ Error handling works for failed messages
✅ Database is updated correctly (send_queue status, campaign counters)

### Troubleshooting

**If messages aren't sending:**
- Check backend logs for errors
- Verify migrations were run (check for column errors)
- Verify access token is valid (not expired)
- Check WhatsApp API rate limits

**If campaign stays RUNNING:**
- Run `node backend/fix-stuck-messages.js` to manually complete
- Check `send_queue` table for messages stuck in 'processing'

**If rate limiting occurs:**
- Watch for 429 errors in logs
- Rate should auto-decrease by 20%
- Wait a minute and retry

---

## What You Can Test Now (After Phase 6)

### Prerequisites
- Complete Phase 7 setup (queue processor operational)
- Have at least one active WhatsApp number
- Have at least one APPROVED UTILITY template
- Backend server and cron worker running

### Test Campaign Scheduling & Pre-flight Validation

1. **Start Cron Worker:**
   ```bash
   cd backend
   npm run cron
   ```
   - Should see in logs:
     ```
     🕐 Starting cron jobs...
     ✅ Supabase connection established
     ✅ Cron jobs started:
        - Campaign scheduler: every minute
        - Stuck message recovery: every 5 minutes
        - Cleanup jobs: daily at 3 AM IST
     ⏰ Timezone: Asia/Kolkata
     ```

2. **Create Scheduled Campaign:**
   - Go to Campaigns page
   - Click "+ Create Campaign"
   - Fill in details:
     - Name: `Scheduled Test 1`
     - WhatsApp Number: Select your number
     - Templates: Select one UTILITY template
     - CSV: Upload 2-3 valid phone numbers
     - Check "Schedule for later"
     - Set time: 2 minutes from now (IST timezone)
   - Click "Create Campaign"
   - Campaign should show status: SCHEDULED (blue)

3. **Watch Campaign Auto-Start (Wait 2 minutes):**
   - In cron worker logs, after scheduled time passes:
     ```
     [Cron] Running campaign scheduler...
     [Cron] Found 1 scheduled campaign(s) due to start
     [Cron] Campaign "Scheduled Test 1" passed pre-flight validation, enqueueing messages...
     [Cron] Campaign "Scheduled Test 1" started successfully
     ```
   - Campaign status should change: SCHEDULED → RUNNING (green)
   - Messages should start sending via queue processor

4. **Test Pre-flight Validation - Quarantined Template:**
   - Create a scheduled campaign with a template
   - In Supabase, manually quarantine that template:
     ```sql
     UPDATE templates
     SET is_quarantined = true, is_active = false
     WHERE name = 'your_template_name';
     ```
   - Wait for scheduled time
   - Cron logs should show:
     ```
     [Cron] Campaign "Test" failed pre-flight validation: ["Template "xxx" is quarantined"]
     [Cron] Campaign "Test" marked as failed
     ```
   - Campaign status: FAILED (red)
   - Check notifications API: Should have "Campaign Failed" notification

5. **Test Pre-flight Validation - Inactive WhatsApp Number:**
   - Create a scheduled campaign
   - Before scheduled time, mark WhatsApp number as inactive:
     ```sql
     UPDATE whatsapp_numbers
     SET is_active = false
     WHERE id = 'your_number_id';
     ```
   - Wait for scheduled time
   - Campaign should fail with "WhatsApp number is not active" error
   - Notification created

6. **Test Notification API:**
   ```bash
   # Get all notifications
   curl http://localhost:8080/api/notifications \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"

   # Get unread count
   curl http://localhost:8080/api/notifications/unread-count \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"

   # Mark notification as read
   curl -X PATCH http://localhost:8080/api/notifications/{id}/read \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"

   # Mark all as read
   curl -X PATCH http://localhost:8080/api/notifications/read-all \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

7. **Test Stuck Message Recovery (every 5 minutes):**
   - Manually set some messages to 'processing' status with old timestamp:
     ```sql
     UPDATE send_queue
     SET status = 'processing',
         updated_at = NOW() - INTERVAL '10 minutes'
     WHERE id IN (SELECT id FROM send_queue LIMIT 2);
     ```
   - Wait 5 minutes
   - Cron logs should show:
     ```
     [Cron] Running stuck message recovery...
     [Cron] Recovered 2 stuck message(s)
     ```
   - Messages should be reset to 'ready' status

### Verify Database Updates

Check in Supabase:

1. **notifications table:**
   ```sql
   SELECT * FROM notifications
   ORDER BY created_at DESC
   LIMIT 10;
   ```
   - Should see notifications for failed campaigns
   - Fields: type, title, message, action_url, related_entity_type

2. **campaigns table:**
   ```sql
   SELECT name, status, scheduled_start_time, start_time
   FROM campaigns
   WHERE is_scheduled = true
   ORDER BY created_at DESC;
   ```
   - Scheduled campaigns should have scheduled_start_time
   - After auto-start: status = 'running', start_time populated

### Success Criteria for Phase 6

✅ Cron worker starts without errors
✅ Campaign scheduler runs every minute
✅ Scheduled campaigns auto-start at specified time
✅ Pre-flight validation checks templates (active, not quarantined)
✅ Pre-flight validation checks WhatsApp number (active)
✅ Failed campaigns marked with status 'failed'
✅ Notifications created for failed campaigns
✅ Notification API endpoints work (list, unread count, mark read)
✅ Stuck message recovery runs every 5 minutes
✅ Cleanup jobs scheduled (run daily at 3 AM IST)
✅ Multiple scheduled campaigns on same number run sequentially

### Troubleshooting

**If cron worker won't start:**
- Check backend/.env has correct credentials
- Verify node-cron is installed: `npm list node-cron`
- Check for syntax errors in cron.js

**If campaigns don't auto-start:**
- Check scheduled_start_time is in the past
- Verify cron worker is running (check logs)
- Check campaign status is 'scheduled'
- Look for validation errors in cron logs

**If pre-flight validation fails unexpectedly:**
- Verify templates are not quarantined in database
- Check WhatsApp number is_active = true
- Ensure template category is UTILITY

---

## What You Can Test Now (After Phase 8)

### Prerequisites
- Complete Phase 7 setup (queue processor operational)
- Have at least one active WhatsApp number
- Backend server running
- ngrok or similar tunnel for webhook testing
- Meta Developer Account with WhatsApp Business API configured

### Setup Webhook URL

1. **Start ngrok tunnel:**
   ```bash
   ngrok http 8080
   ```
   - Copy the HTTPS URL (e.g., https://abc123.ngrok.io)

2. **Configure webhook in Meta Business Manager:**
   - Go to: https://developers.facebook.com/apps/YOUR_APP_ID/whatsapp-business/wa-settings/
   - Click "Configuration" under Webhooks
   - Callback URL: `https://abc123.ngrok.io/api/webhooks`
   - Verify Token: Value from `META_WEBHOOK_VERIFY_TOKEN` in .env
   - Click "Verify and Save"
   - Subscribe to fields: `messages`, `message_status`

3. **Update .env file:**
   ```bash
   META_APP_SECRET=your-app-secret-from-meta
   META_WEBHOOK_VERIFY_TOKEN=your-verify-token
   ```

### Test Webhook Verification

1. **Test GET endpoint manually:**
   ```bash
   curl "http://localhost:8080/api/webhooks?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
   ```
   - Should return: `test123`

2. **Meta will verify automatically:**
   - When you click "Verify and Save" in Meta dashboard
   - Check backend logs for:
     ```
     [Webhook] Verification request received
     [Webhook] Mode: subscribe
     [Webhook] ✅ Verification successful
     ```

### Test Status Updates (Delivery Receipts)

1. **Send a test message via campaign:**
   - Create and run a small campaign (1-2 contacts)
   - Use your own phone number for testing

2. **Watch webhook logs:**
   ```
   [Webhook] Event received
   [Webhook] ✅ Signature verified
   [Webhook] Processing 1 entry/entries
   [Webhook] Updated message xxx: sent → delivered
   [Webhook] ✅ Webhook processed successfully
   ```

3. **Check database:**
   ```sql
   -- Check message status
   SELECT whatsapp_message_id, status, created_at
   FROM messages
   ORDER BY created_at DESC
   LIMIT 10;

   -- Check status logs
   SELECT whatsapp_message_id, status, created_at
   FROM message_status_logs
   ORDER BY created_at DESC
   LIMIT 20;
   ```

4. **Test status hierarchy:**
   - Message should progress: sent → delivered → read
   - If "read" webhook arrives before "delivered":
     - Status log created for both
     - Message status jumps directly to "read" (highest in hierarchy)

### Test Incoming Messages

1. **Send a message to your WhatsApp Business number:**
   - From any WhatsApp account, send "Hello"

2. **Watch webhook logs:**
   ```
   [Webhook] Event received
   [Webhook] ✅ Signature verified
   [Webhook] Incoming message saved: wamid.xxx from 919876543210
   [Webhook] ✅ Webhook processed successfully
   ```

3. **Check database:**
   ```sql
   SELECT *
   FROM messages
   WHERE direction = 'incoming'
   ORDER BY created_at DESC
   LIMIT 5;
   ```
   - Should see: direction='incoming', message_body='Hello', user_phone

### Test Idempotency

1. **Send duplicate webhook (simulate):**
   ```bash
   # Meta sometimes sends duplicate webhooks
   # Manually trigger same webhook twice
   ```

2. **Check logs:**
   ```
   [Webhook] Message xxx already exists, skipping
   [Webhook] Duplicate status log for xxx - delivered, skipping
   ```

3. **Verify database:**
   - Only one message record per whatsapp_message_id
   - Only one status log per (whatsapp_message_id, status) combination

### Test Signature Verification

1. **Test invalid signature:**
   ```bash
   curl -X POST http://localhost:8080/api/webhooks \
     -H "Content-Type: application/json" \
     -H "X-Hub-Signature-256: sha256=invalid" \
     -d '{"object":"whatsapp_business_account"}'
   ```
   - Should return 200 (to Meta)
   - But logs show: `[Webhook] ❌ Invalid signature - webhook rejected`
   - No data saved to database

### Test Out-of-Order Webhooks

1. **Scenario: Read receipt arrives before delivered:**
   - Send message to test number
   - WhatsApp might send "read" before "delivered" (common issue)

2. **Expected behavior:**
   - Both status logs created
   - Message status = "read" (highest in hierarchy)
   - No downgrade even if "delivered" arrives later

3. **Check with SQL:**
   ```sql
   SELECT
     m.whatsapp_message_id,
     m.status as message_status,
     msl.status as log_status,
     msl.created_at
   FROM messages m
   JOIN message_status_logs msl ON m.whatsapp_message_id = msl.whatsapp_message_id
   WHERE m.whatsapp_message_id = 'wamid.xxx'
   ORDER BY msl.created_at;
   ```

### Verify Database Updates

Check in Supabase:

1. **messages table:**
   ```sql
   SELECT
     direction,
     message_type,
     status,
     COUNT(*)
   FROM messages
   GROUP BY direction, message_type, status;
   ```
   - Incoming: direction='incoming', status='received'
   - Outgoing: direction='outgoing', status progresses (sent → delivered → read)

2. **message_status_logs table:**
   ```sql
   SELECT
     status,
     COUNT(*),
     MIN(created_at) as first,
     MAX(created_at) as last
   FROM message_status_logs
   GROUP BY status;
   ```
   - Should see all status transitions

3. **Check for duplicates (should be 0):**
   ```sql
   -- Check duplicate messages
   SELECT whatsapp_message_id, COUNT(*)
   FROM messages
   GROUP BY whatsapp_message_id
   HAVING COUNT(*) > 1;

   -- Check duplicate status logs
   SELECT whatsapp_message_id, status, COUNT(*)
   FROM message_status_logs
   GROUP BY whatsapp_message_id, status
   HAVING COUNT(*) > 1;
   ```

### Success Criteria for Phase 8

✅ Webhook verification endpoint works (GET)
✅ Webhook POST handler receives events
✅ Meta signature verification prevents unauthorized access
✅ Idempotency check prevents duplicate messages
✅ Incoming messages saved to database
✅ Status updates saved to message_status_logs
✅ Status hierarchy enforced (no downgrades)
✅ Out-of-order webhooks handled correctly
✅ Always returns 200 to Meta (prevents retries)
✅ Duplicate webhooks ignored gracefully
✅ Failed status updates always applied
✅ Read status never downgrades to delivered

### Troubleshooting

**If webhook verification fails:**
- Check META_WEBHOOK_VERIFY_TOKEN matches Meta dashboard
- Verify ngrok tunnel is active
- Check backend logs for verification requests

**If signature verification fails:**
- Check META_APP_SECRET is correct (from Meta app settings)
- Verify webhook is coming from Meta (check IP if needed)
- Check backend logs for signature details

**If messages not saved:**
- Check whatsapp_number exists in database
- Verify phone_number_id matches database record
- Check for errors in webhook processing logs

**If status not updating:**
- Check status hierarchy logic (can't downgrade)
- Verify message exists before status update
- Look for UNIQUE constraint violations in logs

**If receiving duplicate webhooks:**
- This is normal - Meta retries on timeout
- Check idempotency logs - should skip duplicates
- Verify UNIQUE constraints on tables

---

## Next Phase Preview

**Phase 9: LLM Integration & Auto-Reply**

After Phase 9 completion, you will be able to:
- Automatic AI-powered replies to incoming messages
- 40 reply lifetime limit per customer phone number
- Context-aware responses using last 10 messages
- System prompts per WhatsApp number
- Silent stop after 40 replies reached

**What you'll need for Phase 9:**
- OpenAI API key
- Webhook system operational (Phase 8)
- Incoming messages working

---

## What You Can Test Now (After Phase 9)

### Prerequisites
- Complete Phase 8 setup (webhooks operational)
- Have at least one active WhatsApp number with system prompt configured
- Backend server running
- ngrok tunnel active and webhook configured
- OpenAI API key configured in .env

### Setup OpenAI Integration

1. **Update .env file:**
   ```bash
   OPENAI_API_KEY=sk-your-openai-api-key-here
   OPENAI_MODEL=gpt-4o-mini
   ```

2. **Set system prompt for WhatsApp number:**
   ```sql
   UPDATE whatsapp_numbers
   SET system_prompt = 'You are a helpful customer support assistant for XYZ Company. Be friendly, concise, and professional. Help customers with their inquiries about our products and services.'
   WHERE id = 'your-whatsapp-number-id';
   ```

### Test Auto-Reply Functionality

1. **Send a text message to your WhatsApp Business number:**
   - From any WhatsApp account, send: "Hello, I need help"

2. **Watch backend logs:**
   ```
   [Webhook] Incoming message saved: wamid.xxx from 919876543210
   [LLM] Processing auto-reply for 919876543210 (0/40 replies used)
   [LLM] Generating reply with 1 context messages
   [LLM] Generated reply: Hello! I'm here to help you...
   [LLM] Sent WhatsApp message: wamid.yyy
   [LLM] Saved outgoing message to database
   [LLM] Incremented reply count for 919876543210: 1
   [LLM] ✅ Auto-reply sent successfully to 919876543210 (1/40)
   [Webhook] ✅ Auto-reply sent to 919876543210
   ```

3. **Verify in WhatsApp:**
   - Should receive AI-generated reply within 1-2 seconds
   - Reply should be contextual and follow system prompt tone

4. **Check database:**
   ```sql
   -- Check messages
   SELECT direction, message_body, created_at
   FROM messages
   WHERE user_phone = '919876543210'
   ORDER BY created_at DESC
   LIMIT 10;

   -- Check reply count
   SELECT user_phone, reply_count, last_reply_at
   FROM user_reply_limits
   WHERE user_phone = '919876543210';
   ```

### Test Conversation Context (Last 10 Messages)

1. **Send multiple messages in sequence:**
   - Message 1: "What are your business hours?"
   - Wait for reply
   - Message 2: "Do you offer home delivery?"
   - Wait for reply
   - Message 3: "What about the pricing?"

2. **Observe context-awareness:**
   - Replies should reference previous conversation
   - AI should maintain conversation flow
   - Each reply uses last 10 messages as context

3. **Check logs:**
   ```
   [LLM] Generating reply with 5 context messages
   ```
   - Number increases as conversation grows (max 10)

### Test 40 Reply Limit

1. **Simulate 40 replies:**
   ```sql
   -- Manually set count to 39
   UPDATE user_reply_limits
   SET reply_count = 39
   WHERE user_phone = '919876543210';
   ```

2. **Send message:**
   - Should receive 1 more reply (reply #40)

3. **Send another message:**
   - Should NOT receive reply
   - Logs show:
     ```
     [LLM] Skipping auto-reply for 919876543210: limit reached (40/40)
     [Webhook] ⏭️  Auto-reply skipped for 919876543210: limit_reached
     ```

4. **Verify database:**
   ```sql
   SELECT reply_count FROM user_reply_limits
   WHERE user_phone = '919876543210';
   -- Should show: 40
   ```

5. **No notification to customer:**
   - Silent stop - customer doesn't see any error message
   - Incoming message is saved, just no auto-reply sent

### Test Message Type Filtering

1. **Send non-text message types:**
   - Image
   - Voice note
   - Location
   - Contact card

2. **Expected behavior:**
   - Incoming message saved to database
   - No auto-reply generated
   - Logs show:
     ```
     [LLM] Skipping auto-reply for 919876543210: message type is image
     [Webhook] ⏭️  Auto-reply skipped for 919876543210: not_text
     ```

3. **Reply count not incremented:**
   ```sql
   -- Verify count unchanged
   SELECT reply_count FROM user_reply_limits
   WHERE user_phone = '919876543210';
   ```

### Test LLM Failure Handling

1. **Simulate OpenAI API failure:**
   - Temporarily set invalid API key in .env
   - Restart server

2. **Send text message:**
   - Incoming message saved
   - No reply sent
   - Logs show:
     ```
     [LLM] ❌ Error in auto-reply (silent failure): Invalid API key
     [Webhook] Error in auto-reply background task: ...
     ```

3. **Verify graceful failure:**
   - No crash or error response to customer
   - Reply count NOT incremented
   - Message marked as received in database

4. **Fix and retry:**
   - Set correct API key
   - Restart server
   - Send new message - should work

### Test System Prompt Variations

1. **Test different tones:**
   ```sql
   -- Formal tone
   UPDATE whatsapp_numbers
   SET system_prompt = 'You are a professional business assistant. Use formal language and provide detailed responses.'
   WHERE id = 'your-id';

   -- Casual tone
   UPDATE whatsapp_numbers
   SET system_prompt = 'You are a friendly helper. Use casual, conversational language and be warm and approachable.'
   WHERE id = 'your-id';

   -- Technical support
   UPDATE whatsapp_numbers
   SET system_prompt = 'You are a technical support specialist. Provide step-by-step troubleshooting help and ask clarifying questions.'
   WHERE id = 'your-id';
   ```

2. **Send same message with different prompts:**
   - Observe how tone and style changes
   - Verify system prompt is being applied

### Verify Database Updates

Check in Supabase:

1. **messages table:**
   ```sql
   SELECT
     direction,
     message_type,
     message_body,
     created_at
   FROM messages
   WHERE user_phone = '919876543210'
   ORDER BY created_at DESC;
   ```
   - Should see alternating incoming/outgoing messages
   - Outgoing messages contain AI responses

2. **user_reply_limits table:**
   ```sql
   SELECT
     user_phone,
     reply_count,
     last_reply_at,
     created_at
   FROM user_reply_limits
   ORDER BY last_reply_at DESC;
   ```
   - Tracks all customers who received auto-replies
   - Counts increment with each reply
   - last_reply_at updates

3. **Check global stats:**
   ```sql
   -- Total auto-replies sent
   SELECT COUNT(*) FROM user_reply_limits;

   -- Users who hit limit
   SELECT COUNT(*) FROM user_reply_limits
   WHERE reply_count >= 40;

   -- Average replies per user
   SELECT AVG(reply_count) FROM user_reply_limits;
   ```

### Success Criteria for Phase 9

✅ Auto-reply triggered on incoming text messages
✅ Only text messages receive replies (media/location skipped)
✅ Reply count checked before sending (40 limit enforced)
✅ Last 10 messages fetched for context
✅ OpenAI API generates contextual responses
✅ Replies sent via WhatsApp API successfully
✅ Reply count incremented after each successful reply
✅ Silent stop after 40 replies (no notification to customer)
✅ LLM failures handled silently (no crash, no retry)
✅ System prompt applied correctly
✅ Conversation context maintained across messages
✅ Auto-reply processed immediately (synchronous)

### Troubleshooting

**If auto-reply not working:**
- Check OPENAI_API_KEY is valid
- Verify webhook is receiving messages (Phase 8)
- Check system prompt is set for WhatsApp number
- Look for errors in backend logs

**If replies are generic/not contextual:**
- Verify last 10 messages are being fetched
- Check conversation history in database
- Ensure messages are linked to correct WhatsApp number

**If hitting rate limits:**
- OpenAI has rate limits per account
- Consider upgrading OpenAI plan
- Implement queuing if needed

**If reply count not incrementing:**
- Check user_reply_limits table exists
- Verify database insert/update succeeds
- Look for SQL errors in logs

**If customer hits 40 limit:**
- Manual reset required via database:
  ```sql
  UPDATE user_reply_limits
  SET reply_count = 0
  WHERE user_phone = '919876543210';
  ```

**If system prompt not working:**
- Verify system_prompt column has value
- Check it's being passed to OpenAI API
- Review OpenAI logs for system message

---

## Next Phase Preview

**Phase 10: Frontend Dashboard & Campaign UI**

After Phase 10 completion, you will have:
- Complete dashboard with real-time stats
- Campaign creation and management UI
- Campaign analytics and export
- Real-time updates via Supabase Realtime
- Responsive design with Tailwind CSS

**What you'll need for Phase 10:**
- Frontend development skills (React)
- Tailwind CSS
- API integration with backend
- Real-time subscriptions

---

**Document Version:** 1.8
**Status:** Phase 11 Complete ✅ - Inbox & Conversations Operational
**Session:** 5 phases completed in this session (Phase 6 + Phase 8 + Phase 9 + Phase 10 + Phase 11)

---

## What You Can Test Now (After Phase 11)

### Prerequisites
- Complete Phase 9 setup (LLM auto-reply operational)
- Have at least one active WhatsApp number
- Backend server running with webhook active
- Frontend running (npm run dev)
- At least a few messages in the database (send/receive via WhatsApp)

### Test Inbox & Conversations

1. **Navigate to Inbox page:**
   - Go to Dashboard
   - Click "Inbox" card or navigate to `/inbox`
   - Should see Inbox page with:
     - Filters at top (WhatsApp Number, Search, Date Range)
     - Conversation list on left
     - Empty message thread viewer on right (select a conversation first)

2. **View Conversations List:**
   - Left panel shows all conversations grouped by user_phone
   - Each conversation shows:
     - Customer phone number
     - WhatsApp number display name
     - Last message preview
     - Time of last message
     - Unread count badge (if any)
     - Reply limit indicator (40/40 if limit reached)
   - Conversations sorted by most recent message first

3. **Select Conversation:**
   - Click any conversation in the list
   - Right panel should load:
     - Conversation header with phone number and stats
     - Reply count indicator (e.g., "Replies: 5/40")
     - Message thread with all messages
   - Messages displayed:
     - Incoming messages: left-aligned, white background
     - Outgoing messages: right-aligned, indigo background
     - Timestamps shown for each message
     - Status indicator for outgoing messages (sent/delivered/read)

4. **Test Filters:**

   **WhatsApp Number Filter:**
   - Select a WhatsApp number from dropdown
   - Conversation list should filter to only show conversations for that number

   **Search Filter:**
   - Type phone number or message text in search box
   - Conversations matching search query should appear
   - Try searching for: "hello", "help", specific phone number

   **Date Range Filter:**
   - Set Start Date and End Date
   - Only conversations with messages in that date range should show

   **Clear Filters:**
   - Click "Clear all filters" button
   - All filters reset, full conversation list shows

5. **Test Reply Limit Indicator:**
   - Conversations with 40 replies should show red badge "40/40"
   - In thread header, should show "Reply limit reached (40/40)"
   - For conversations under 40, should show "Replies: X/40"

6. **Test Real-time Updates:**
   - Keep Inbox page open
   - Send a message to your WhatsApp Business number from another phone
   - Within 1-2 seconds:
     - New conversation appears (or existing one moves to top)
     - Auto-reply message appears in thread
     - Unread count updates
     - Reply count increments

7. **Test Search Functionality:**
   - Use search bar to find specific messages
   - Should search across both phone numbers and message content
   - Results update in real-time as you type

8. **Test Conversation Stats:**
   - Header shows overall stats:
     - Total conversations count
     - Total messages count
   - Stats update when filters are applied

### Verify Database Queries

Check backend logs and Supabase:

1. **Conversation grouping query:**
   ```sql
   SELECT
     user_phone,
     whatsapp_number_id,
     COUNT(*) as message_count,
     MAX(created_at) as last_message_time
   FROM messages
   GROUP BY user_phone, whatsapp_number_id
   ORDER BY last_message_time DESC;
   ```

2. **Reply limits:**
   ```sql
   SELECT
     user_phone,
     reply_count,
     last_reply_at
   FROM user_reply_limits
   ORDER BY reply_count DESC;
   ```

3. **Messages for specific conversation:**
   ```sql
   SELECT
     direction,
     message_type,
     message_body,
     status,
     created_at
   FROM messages
   WHERE whatsapp_number_id = 'your-id'
     AND user_phone = '919876543210'
   ORDER BY created_at ASC;
   ```

### Success Criteria for Phase 11

✅ Inbox page loads and displays all conversations
✅ Conversations grouped by user_phone correctly
✅ Conversation list shows last message and timestamp
✅ Message thread viewer displays all messages chronologically
✅ Incoming messages align left (white background)
✅ Outgoing messages align right (indigo background)
✅ WhatsApp number filter works
✅ Search filter works (phone and message content)
✅ Date range filter works
✅ Clear filters button resets all filters
✅ Reply limit indicator shows correctly (X/40)
✅ Reply limit reached badge shows when count = 40
✅ Real-time updates work (new messages appear instantly)
✅ Conversation stats display correctly
✅ Unread count badge appears on conversations
✅ Clicking conversation loads message thread
✅ Timestamps formatted correctly (Today: HH:MM, Older: MMM DD)
✅ Message status shown for outgoing messages

### Troubleshooting

**If no conversations appear:**
- Check if you have any messages in the database
- Send a message to your WhatsApp number to create conversation
- Check backend API is responding: `/api/messages/conversations`
- Look for errors in browser console

**If messages not loading:**
- Check conversation is selected (highlighted in list)
- Verify API endpoint works: `/api/messages/conversations/:id/:phone`
- Check browser console for errors
- Verify whatsapp_number_id and user_phone are correct

**If filters not working:**
- Check query params are being passed to API
- Verify backend controller handles filter params
- Check network tab for API calls with params

**If real-time updates not working:**
- Verify Supabase Realtime is enabled for messages table
- Check browser console for subscription errors
- Ensure SUPABASE_URL and SUPABASE_ANON_KEY are correct
- Try refreshing page manually

**If reply count not showing:**
- Check user_reply_limits table has data
- Verify backend fetches reply count in conversation query
- Look for SQL errors in backend logs

---

## Session 3 Summary

In this session, we completed **5 major phases** of the WhatsApp Cloud API Automation Platform:

### Phase 6: Campaign Scheduling & Pre-flight Validation ✅
- Cron worker for automatic campaign scheduling
- Pre-flight validation before campaign execution
- Notification system for failed campaigns
- Stuck message recovery
- Automatic cleanup jobs

### Phase 8: Webhook Handlers ✅
- Webhook verification endpoint
- Meta signature verification (HMAC SHA256)
- Idempotency handling
- Incoming message processing
- Status update tracking with hierarchy
- Out-of-order webhook handling

### Phase 9: LLM Integration & Auto-Reply ✅
- OpenAI GPT integration
- 40 lifetime reply limit per customer
- Conversation context (last 10 messages)
- System prompts per WhatsApp number
- Silent failure handling
- Text-only message filtering

### Phase 10: Frontend Dashboard & Campaign UI ✅
- Real-time dashboard with live stats
- Notifications bell with dropdown UI
- Supabase Realtime subscriptions
- Mark notifications as read
- Click-to-navigate functionality
- Loading states and error handling

### Phase 11: Inbox & Conversations ✅
- Backend messages controller with conversation grouping
- Conversation list with last message preview
- Message thread viewer (left/right aligned)
- Search and filter controls (number, search, date range)
- Reply limit indicator (X/40 display)
- Real-time message updates via Supabase
- Unread count badges
- Responsive two-panel layout

**Overall Progress:** 11/17 phases completed (65%)
**Remaining:** 6 phases
**Backend:** Fully operational with cron jobs, webhooks, queue processing, LLM auto-replies, and messages API
**Frontend:** Dashboard, Notifications, and Inbox complete with real-time updates
