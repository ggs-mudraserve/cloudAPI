# Phase 3: WhatsApp Numbers Management - Testing Guide

**Status:** ✅ COMPLETE
**Last Updated:** 2025-11-06

---

## 🎉 What's Been Built

### Backend
- ✅ WhatsApp Cloud API service (`whatsappService.js`)
  - Test connection to WhatsApp API
  - Send template messages
  - Send text messages
  - Fetch templates with pagination
  - Mark messages as read
- ✅ WhatsApp numbers controller (`whatsappNumbersController.js`)
  - Test connection before saving
  - List all numbers
  - Get single number
  - Add new number
  - Update system prompt
  - Delete number
- ✅ WhatsApp numbers routes
  - POST `/api/whatsapp-numbers/test` - Test connection
  - GET `/api/whatsapp-numbers` - List all
  - GET `/api/whatsapp-numbers/:id` - Get one
  - POST `/api/whatsapp-numbers` - Add new
  - PUT `/api/whatsapp-numbers/:id` - Update prompt
  - DELETE `/api/whatsapp-numbers/:id` - Delete

### Frontend
- ✅ WhatsApp Numbers page (`WhatsAppNumbers.jsx`)
  - List all connected numbers
  - Status badges (Active/Inactive)
  - Tier badges (TIER_1000, TIER_10K, etc.)
  - Quality rating display
  - Send rate display
- ✅ Add Number Modal (`AddNumberModal.jsx`)
  - Phone Number ID input
  - Access Token input
  - Test Connection button
  - Auto-fill display name from API
  - System prompt editor
  - Success/error feedback
- ✅ Delete Confirmation Modal (`DeleteConfirmModal.jsx`)
  - Warning about cascading deletes
  - Confirm/Cancel actions
- ✅ Navigation
  - Dashboard → WhatsApp Numbers link
  - Clickable card with arrow icon

---

## 🧪 What You Can Test Now

### Prerequisites

**You need WhatsApp Business Platform credentials:**

**Option 1: Use Meta Test Number (Recommended for testing)**
1. Go to: https://developers.facebook.com/apps
2. Select your app or create a new one
3. Add "WhatsApp" product
4. Go to: API Setup → Get Started
5. You'll see a **Test Phone Number** with:
   - Phone Number ID (15-digit number)
   - Temporary Access Token (valid for 24 hours)
6. Copy both values

**Option 2: Use Production Number**
1. You need a verified WhatsApp Business Account
2. Add a phone number
3. Get permanent access token
4. Get Phone Number ID from Meta Business Manager

---

## 📋 Step-by-Step Testing

### 1. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### 2. Login to Dashboard

1. Open: http://localhost:3000
2. Login with your admin credentials
3. Should see Dashboard

### 3. Navigate to WhatsApp Numbers

**Option A: Click the "WhatsApp Numbers" card**
- On dashboard, click the first card with the arrow icon

**Option B: Direct URL**
- Navigate to: http://localhost:3000/whatsapp-numbers

**Expected Result:**
- See "WhatsApp Numbers" page
- See "Add Number" button
- See empty state message: "No WhatsApp numbers"

### 4. Add Your First WhatsApp Number

1. **Click "Add Number" button**
   - Modal should open

2. **Enter Phone Number ID**
   - Paste your 15-digit Phone Number ID
   - Example: `123456789012345`

3. **Enter Access Token**
   - Paste your access token
   - Example: `EAAxxxxxxxxxxxxxxxxxx`

4. **Click "Test Connection" button**
   - Should show loading state: "Testing..."
   - Wait 2-3 seconds

**Success Scenario:**
- ✅ Green box appears: "Connection successful!"
- ✅ Shows verified name, quality rating, tier
- ✅ Display Name field auto-fills
- ✅ "Save Number" button becomes enabled

**Failure Scenarios:**
- ❌ Red box: "Token expired or invalid"
  - Solution: Get a new token from Meta
- ❌ Red box: "Connection test failed"
  - Check Phone Number ID is correct
  - Check Access Token is correct
  - Check internet connection

5. **Fill Additional Details**
   - **WhatsApp Number:** Enter with country code (e.g., `919876543210`)
   - **Display Name:** Auto-filled or enter custom name
   - **System Prompt:** Default is "You are a helpful assistant."

6. **Click "Save Number"**
   - Should show "Saving..." button state
   - Modal closes
   - Page reloads automatically

**Expected Result:**
- ✅ Number appears in the list
- ✅ Shows Active badge (green)
- ✅ Shows tier badge (TIER_1000, TIER_10K, etc.)
- ✅ Shows quality rating
- ✅ Shows send rate: "60 msg/sec" (default)

### 5. Verify Number in List

Your number should display:
- **Display Name** (or number if no name)
- **Active status** (green badge)
- **Tier badge** (purple/blue/indigo)
- **Number:** Your WhatsApp number
- **Phone Number ID:** The 15-digit ID
- **Send Rate:** 60 msg/sec (default)
- **Quality:** GREEN, YELLOW, or RED
- **Delete button** (red, on the right)

### 6. Test Adding Second Number

1. Click "Add Number" again
2. Try adding the same Phone Number ID
   - **Expected:** Error message "This WhatsApp number is already registered"
3. Try adding different number with valid credentials
   - **Expected:** Successfully adds second number

### 7. Test Delete Functionality

1. **Click "Delete" button** on any number
   - Confirmation modal opens

2. **Review warning message**
   - Shows what will be deleted:
     - All associated templates
     - All campaign data
     - All message history
   - Shows "This action cannot be undone!"

3. **Click "Cancel"**
   - Modal closes
   - Number still in list

4. **Click "Delete" again, then "Delete" button in modal**
   - Modal closes
   - Number disappears from list
   - Page reloads

**Expected Result:**
- ✅ Number is deleted
- ✅ Database CASCADE deletes related records
- ✅ No errors in console

### 8. Test Empty State

1. Delete all numbers
2. **Expected Result:**
   - See empty state with phone icon
   - Message: "No WhatsApp numbers"
   - "Add Number" button in center

### 9. Test Navigation

1. **From Dashboard:**
   - Click "WhatsApp Numbers" card
   - Should navigate to `/whatsapp-numbers`

2. **Browser back button:**
   - Should return to dashboard

3. **Direct URL:**
   - Enter: `http://localhost:3000/whatsapp-numbers`
   - Should load page (requires authentication)

---

## 🔍 Verify Database

### Check Supabase Dashboard

1. Go to: Supabase Dashboard → Table Editor
2. Open `whatsapp_numbers` table
3. **Should see your added numbers with:**
   - `id` (UUID)
   - `number` (your WhatsApp number)
   - `display_name`
   - `phone_number_id`
   - `access_token` (stored securely)
   - `system_prompt`
   - `max_send_rate_per_sec` = 60
   - `last_stable_rate_per_sec` = 60
   - `quality_rating` (GREEN/YELLOW/RED)
   - `tier` (TIER_1000, etc.)
   - `is_active` = true

### Check API Directly

**List all numbers:**
```bash
curl http://localhost:8080/api/whatsapp-numbers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Test connection:**
```bash
curl -X POST http://localhost:8080/api/whatsapp-numbers/test \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number_id": "123456789012345",
    "access_token": "EAAxxxxx"
  }'
```

---

## ✅ Success Criteria

After testing, you should be able to:
- [x] Navigate to WhatsApp Numbers page from dashboard
- [x] See "Add Number" button
- [x] Open Add Number modal
- [x] Enter Phone Number ID and Access Token
- [x] Click "Test Connection" and see success
- [x] See auto-filled display name and details
- [x] Save the number successfully
- [x] See number in the list with all details
- [x] See Active badge (green)
- [x] See Tier badge with correct tier
- [x] Click Delete button
- [x] See confirmation modal with warnings
- [x] Confirm deletion and see number removed
- [x] See empty state when no numbers exist
- [x] Navigate back to dashboard
- [x] Number persists in database (check Supabase)

---

## 🐛 Troubleshooting

### "Connection test failed"
- **Check:** Phone Number ID is exactly 15 digits
- **Check:** Access Token is valid and not expired
- **Check:** Access Token has permission for this phone number
- **Check:** Internet connection is working

### "This WhatsApp number is already registered"
- **Cause:** Trying to add same Phone Number ID twice
- **Solution:** Use different Phone Number ID or delete existing one first

### "Failed to add WhatsApp number"
- **Check backend logs** in Terminal 1
- **Check Supabase connection** (should see ✅ on startup)
- **Check database** has `whatsapp_numbers` table

### Modal doesn't open
- **Check browser console** (F12) for errors
- **Refresh page** and try again
- **Check** React is loaded properly (no red errors)

### Number doesn't appear after adding
- **Check backend logs** for errors
- **Check network tab** (F12) - should see 201 response
- **Manually refresh** the page
- **Check database** - number should be there

### Delete button doesn't work
- **Check console** for JavaScript errors
- **Check backend logs** for deletion errors
- **Try refreshing** and deleting again

### "Unauthorized" error
- **Cause:** JWT token expired or invalid
- **Solution:** Logout and login again

---

## 📊 What's Next?

**Phase 4: Template Sync System**

After Phase 4, you'll be able to:
- ✅ Navigate to Templates page
- ✅ Click "Sync All" to sync templates from all numbers
- ✅ Click per-number "Sync" button
- ✅ See all synced templates in a list
- ✅ See template status (APPROVED, PENDING, REJECTED)
- ✅ See quarantine status (MARKETING/AUTHENTICATION auto-quarantined)
- ✅ View template history and category changes
- ✅ Manually un-quarantine UTILITY templates

**What you'll need:**
- At least one WhatsApp number added (✅ Done in Phase 3!)
- Templates created in WhatsApp Business Manager
- Templates approved by Meta

---

**Phase 3 Status:** ✅ COMPLETE
**Ready for Phase 4:** YES
