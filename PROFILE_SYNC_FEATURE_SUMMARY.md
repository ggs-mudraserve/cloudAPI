# WhatsApp Profile Sync Feature - Implementation Summary

## Feature Overview

Added the ability to sync WhatsApp Business Profile information (profile picture and verified name) from the WhatsApp Cloud API to the database.

**User Request:** "I want two functionality added to 'Whatsapp Number' page i want buttons to sync Whatsapp profile picture and Display Name."

---

## What Was Implemented

### 1. Database Schema Changes

**New Columns Added to `whatsapp_numbers` table:**
- `profile_picture_url` (text) - Stores the URL of the WhatsApp Business profile picture
- `verified_name` (text) - Stores the WhatsApp verified business name

**Migration File:** `migrations/008_add_profile_picture_url.sql`

### 2. Backend Changes

#### whatsappService.js (backend/src/services/whatsappService.js)
- Added `getBusinessProfile(phoneNumberId, accessToken)` function
- Fetches profile data from WhatsApp Cloud API endpoints:
  - `GET /{phone_number_id}?fields=verified_name,display_phone_number`
  - `GET /{phone_number_id}?fields=account_id` (to get WABA ID)
  - `GET /{waba_id}/whatsapp_business_profile?fields=profile_picture_url,about,...`
- Returns consolidated profile data including `verified_name`, `profile_picture_url`, etc.

#### whatsappNumbersController.js (backend/src/controllers/whatsappNumbersController.js)
- Added `syncProfile(req, res)` controller function
- Fetches WhatsApp number from database
- Calls `getBusinessProfile()` service function
- Updates database with synced profile information
- Updated all sanitized response objects to include `profile_picture_url` and `verified_name` fields

#### whatsappNumbers.js route (backend/src/routes/whatsappNumbers.js)
- Added new POST route: `/api/whatsapp-numbers/:id/sync-profile`
- Protected by JWT authentication middleware

### 3. Frontend Changes

#### WhatsAppNumbers.jsx (frontend/src/pages/WhatsAppNumbers.jsx)
- Added `syncingId` state to track which number is being synced
- Added `handleSyncProfile(numberId)` function to call the API
- Added "Sync Profile" button next to each WhatsApp number
- Button shows loading spinner and "Syncing..." text while in progress
- Button is disabled during sync operation
- Shows success/error alert after sync completes

#### whatsappNumbers.js service (frontend/src/services/whatsappNumbers.js)
- Added `syncProfile(id)` API function
- Makes POST request to `/whatsapp-numbers/:id/sync-profile`

---

## API Endpoints

### New Endpoint

**POST /api/whatsapp-numbers/:id/sync-profile**

**Request:**
- Headers: `Authorization: Bearer <JWT_TOKEN>`
- URL Parameter: `:id` - WhatsApp number ID

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Profile synced successfully",
  "data": {
    "id": "uuid",
    "verified_name": "Business Name",
    "profile_picture_url": "https://...",
    "display_name": "Business Name"
  }
}
```

**Response (Error - 400):**
```json
{
  "error": "Sync Failed",
  "message": "Failed to fetch business profile",
  "code": 190
}
```

**Response (Error - 404):**
```json
{
  "error": "Not Found",
  "message": "WhatsApp number not found"
}
```

---

## User Interface

### WhatsApp Numbers Page Changes

Each WhatsApp number in the list now has two buttons:
1. **Sync Profile** (Blue/Indigo) - New button to sync profile from WhatsApp API
2. **Delete** (Red) - Existing button to delete the number

**Sync Profile Button States:**
- **Normal:** Shows refresh icon + "Sync Profile" text
- **Loading:** Shows spinner + "Syncing..." text, button is disabled

**User Flow:**
1. User clicks "Sync Profile" button
2. Frontend calls `/api/whatsapp-numbers/:id/sync-profile`
3. Backend fetches profile from WhatsApp Cloud API
4. Backend updates database with new `profile_picture_url` and `verified_name`
5. Frontend refreshes the list to show updated data
6. User sees success/error alert

---

## ⚠️ IMPORTANT: Database Migration Required

**Before this feature will work, you MUST run the following SQL in your Supabase SQL Editor:**

```sql
ALTER TABLE whatsapp_numbers
ADD COLUMN IF NOT EXISTS profile_picture_url text;

ALTER TABLE whatsapp_numbers
ADD COLUMN IF NOT EXISTS verified_name text;
```

**Steps to run migration:**

1. Go to https://supabase.com/dashboard/project/qwqjlizrqutphfwxsagz/sql
2. Copy and paste the above SQL
3. Click "Run"
4. Verify columns were added:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'whatsapp_numbers';
   ```

**Alternatively, you can run the migration script:**
```bash
node run-migration-008.js
```
This will check if columns exist and provide instructions.

---

## Testing Checklist

- [ ] Run database migration SQL in Supabase
- [ ] Restart backend server (already done)
- [ ] Refresh frontend in browser
- [ ] Navigate to WhatsApp Numbers page
- [ ] Click "Sync Profile" button on a WhatsApp number
- [ ] Verify success message appears
- [ ] Verify `verified_name` and `profile_picture_url` are updated in database
- [ ] Check that display name updates in the UI after sync

---

## Files Modified

### Backend
1. `backend/src/services/whatsappService.js` - Added `getBusinessProfile()` function
2. `backend/src/controllers/whatsappNumbersController.js` - Added `syncProfile()` controller, updated sanitized responses
3. `backend/src/routes/whatsappNumbers.js` - Added sync-profile route

### Frontend
4. `frontend/src/pages/WhatsAppNumbers.jsx` - Added sync button and handler
5. `frontend/src/services/whatsappNumbers.js` - Added `syncProfile()` API function

### Database
6. `migrations/008_add_profile_picture_url.sql` - Migration file (NOT YET RUN)

### Documentation
7. `run-migration-008.js` - Helper script to check migration status

---

## WhatsApp Cloud API Endpoints Used

1. **Get Phone Number Details:**
   ```
   GET https://graph.facebook.com/v18.0/{phone_number_id}
   ?fields=verified_name,display_phone_number
   ```

2. **Get WABA ID:**
   ```
   GET https://graph.facebook.com/v18.0/{phone_number_id}
   ?fields=account_id
   ```

3. **Get Business Profile:**
   ```
   GET https://graph.facebook.com/v18.0/{waba_id}/whatsapp_business_profile
   ?fields=profile_picture_url,about,address,description,email,websites
   ```

---

## Error Handling

**Backend:**
- Returns 404 if WhatsApp number not found
- Returns 400 if WhatsApp API call fails
- Returns 500 if database update fails
- Logs all errors with details

**Frontend:**
- Shows loading state during sync
- Disables button to prevent duplicate requests
- Shows success alert on completion
- Shows error alert with message on failure
- Refreshes list to show updated data

---

## Next Steps

1. **RUN THE DATABASE MIGRATION** (see above section)
2. Test the feature in the UI
3. Optionally, enhance the UI to display the profile picture (currently only stored, not displayed)
4. Consider adding auto-sync on number addition (currently manual sync only)

---

## Status

✅ Backend implementation complete
✅ Frontend implementation complete
✅ Backend server restarted
⏳ **Database migration pending - YOU NEED TO RUN THIS**

**Feature is ready to use once migration is run!**
