# Media ID Bug Fix - Campaign Service

## Issue
When using Media IDs instead of URLs in CSV files for campaigns with media headers (VIDEO/IMAGE/DOCUMENT), the system was incorrectly injecting the template's example URL and shifting all variables, causing a "Number of parameters does not match" error.

## Root Cause
**File:** `/root/cloudAPI/backend/src/services/campaignService.js` (lines 281-292)

The code only checked if `var1` started with `http://` or `https://` to determine if media was present in the CSV. If the value didn't start with HTTP (like a Media ID `1585210746173316`), it assumed no media was provided and:

1. Injected the template's example URL as `var1`
2. Shifted all CSV variables by one position
3. Created extra variables beyond what the template expected

### Example of Bug:
**CSV Input:**
```csv
Phone,MediaID,Name,Status
919555555611,1585210746173316,Nitin,InComplete
```

**Expected Variables:**
```javascript
{
  var1: "1585210746173316",  // Media ID
  var2: "Nitin",             // Name
  var3: "InComplete"         // Status
}
```

**Actual Variables (Buggy):**
```javascript
{
  var1: "https://example.com/template-video.mp4",  // Injected from template
  var2: "1585210746173316",                        // Shifted Media ID
  var3: "Nitin",                                   // Shifted Name
  var4: "InComplete"                               // Shifted Status
}
```

Template expects 3 variables but got 4 → Error!

## Fix
Updated the detection logic to recognize both URLs and Media IDs:

```javascript
// OLD CODE (Buggy)
const csvHasMediaUrl = contact.variables.var1 &&
  (String(contact.variables.var1).startsWith('http://') ||
   String(contact.variables.var1).startsWith('https://'));

if (csvHasMediaUrl) {
  // Use CSV media
  payload = contact.variables;
} else {
  // Inject example URL and shift variables
}

// NEW CODE (Fixed)
const var1Value = String(contact.variables.var1 || '');
const csvHasMediaUrl = var1Value.startsWith('http://') || var1Value.startsWith('https://');
const csvHasMediaId = var1Value.length > 0 && !csvHasMediaUrl; // Any non-URL value is treated as Media ID

if (csvHasMediaUrl || csvHasMediaId) {
  // CSV has media (URL or ID), use it as-is
  console.log(`[Campaign] Using media ${csvHasMediaUrl ? 'URL' : 'ID'} from CSV for template ${templateName}`);
  payload = contact.variables;
} else {
  // No media provided, inject example URL
}
```

## Impact
- ✅ Media IDs now work correctly in CSV files
- ✅ No variable shifting occurs when Media ID is provided
- ✅ Auto-detect works for both URLs and Media IDs
- ✅ Backward compatible with existing URL-based campaigns

## Testing
Create a campaign with this CSV:

```csv
Phone,MediaID,Name,Status
919555555611,1585210746173316,John,Complete
919718577453,1585210746173316,Jane,Pending
```

**Expected Result:**
- Messages sent successfully with Media ID
- No parameter mismatch errors
- Logs show: `[Campaign] Using media ID from CSV for template <name>`

## Deployment
- **Date:** 2025-11-15
- **Server:** Restarted via PM2
- **Status:** ✅ Fixed and deployed

## Related Files
- `/root/cloudAPI/backend/src/services/campaignService.js` (line 281-292)
- `/root/cloudAPI/backend/src/services/whatsappService.js` (auto-detect URL vs ID)
