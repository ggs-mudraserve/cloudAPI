# CSV Format Guide for Campaign Creation

This guide explains the two CSV formats supported for campaign creation, depending on whether you're using custom media URLs or the template's approved WhatsApp CDN media.

---

## Option 1: Using Custom Media URLs (Default)

**When to use:** When you want to use different media (image/video/document) for each recipient, provided in your CSV file.

**Checkbox setting:** Leave "Use template's approved media" **UNCHECKED**

### CSV Format

```csv
Phone,{{Media}},{{1}},{{2}},{{3}},...
919876543210,https://your-cdn.com/video1.mp4,John,Approved,Delhi
919876543211,https://your-cdn.com/video2.mp4,Sarah,Pending,Mumbai
919876543212,https://your-cdn.com/video3.mp4,Mike,Approved,Bangalore
```

### Column Structure

1. **First Column (Phone)**: Phone number with country code (e.g., 91 for India)
   - Must be exactly 12 digits starting with 91
   - Example: `919876543210`

2. **Second Column ({{Media}})**: Media URL for the header component
   - Must be publicly accessible HTTPS URL
   - Supported formats:
     - **Images**: JPG, PNG (max 5MB)
     - **Videos**: MP4, 3GP (max 16MB)
     - **Documents**: PDF (max 100MB)
   - Example: `https://your-cdn.com/video.mp4`

3. **Remaining Columns ({{1}}, {{2}}, etc.)**: Template body variables
   - Map directly to template variables in order
   - Example: If template has "Hi {{1}}, your status is {{2}}"
     - Column 3 → {{1}} (Name)
     - Column 4 → {{2}} (Status)

### Example Template

```
HEADER: {{MEDIA}}
BODY: Hi {{1}}, your application status is {{2}} for {{3}} location.
```

### Example CSV

```csv
Phone,{{Media}},{{1}},{{2}},{{3}}
919876543210,https://cdn.example.com/video1.mp4,John,Approved,Delhi
919876543211,https://cdn.example.com/video2.mp4,Sarah,Pending,Mumbai
```

---

## Option 2: Using Template's Approved Media (NEW Feature)

**When to use:** When all recipients should receive the same media that was approved by WhatsApp during template creation.

**Checkbox setting:** Check "Use template's approved media" box

### CSV Format

```csv
Phone,{{1}},{{2}},{{3}},...
919876543210,John,Approved,Delhi
919876543211,Sarah,Pending,Mumbai
919876543212,Mike,Approved,Bangalore
```

### Column Structure

1. **First Column (Phone)**: Phone number with country code
   - Same requirements as Option 1
   - Must be exactly 12 digits starting with 91
   - Example: `919876543210`

2. **Remaining Columns ({{1}}, {{2}}, etc.)**: Template body variables
   - **NO MEDIA COLUMN NEEDED** - system automatically uses template's approved media
   - Map directly to template body variables in order
   - Example: If template has "Hi {{1}}, your status is {{2}}"
     - Column 2 → {{1}} (Name)
     - Column 3 → {{2}} (Status)

### How It Works

1. When the checkbox is checked, the system:
   - Fetches the approved media URL from the template's WhatsApp CDN
   - Automatically injects it as the first variable ({{Media}})
   - Shifts your CSV variables accordingly

2. **Behind the scenes transformation:**
   ```
   Your CSV:    Phone, {{1}}, {{2}}
   System uses: Phone, {{Media}}, {{1}}, {{2}}
                       ↑ Auto-injected from template
   ```

### Example Template

```
HEADER: {{MEDIA}}
BODY: Hi {{1}}, your application status is {{2}} for {{3}} location.
```

### Example CSV

```csv
Phone,{{1}},{{2}},{{3}}
919876543210,John,Approved,Delhi
919876543211,Sarah,Pending,Mumbai
```

**Note:** The system automatically uses the WhatsApp CDN URL that was approved when the template was created.

---

## Benefits of Each Option

### Option 1: Custom Media URLs
✅ Different media per recipient
✅ Full control over media content
✅ Can update media without template re-approval
❌ Must host media on your own CDN
❌ Media URLs must be publicly accessible

### Option 2: Template's Approved Media
✅ No need to host media separately
✅ Simpler CSV format (one less column)
✅ Uses WhatsApp's CDN (faster delivery)
✅ Media already approved by WhatsApp
❌ Same media for all recipients
❌ Changing media requires template re-approval

---

## Common Mistakes

### ❌ Wrong: Mixing formats
```csv
Phone,{{Media}},{{1}},{{2}}
919876543210,https://cdn.com/video.mp4,John,Approved  ← Custom URL
919876543211,,Sarah,Pending                           ← Empty media column
```

**Fix:** Choose one format for the entire campaign. Use Option 1 if you need custom URLs, Option 2 if using template media.

### ❌ Wrong: Including media column when checkbox is checked
```csv
Phone,{{Media}},{{1}},{{2}}  ← Don't include {{Media}} column when using template media
919876543210,https://...,John,Approved
```

**Fix:** When checkbox is checked, remove the media column entirely:
```csv
Phone,{{1}},{{2}}
919876543210,John,Approved
```

### ❌ Wrong: Column count mismatch
If template has 3 body variables but CSV has only 2 data columns (plus phone), the message will fail.

**Fix:** Ensure CSV columns match template variable count exactly.

---

## Migration Guide

### Converting from Option 1 to Option 2

**Before (Custom Media):**
```csv
Phone,{{Media}},{{1}},{{2}}
919876543210,https://cdn.com/video.mp4,John,Approved
919876543211,https://cdn.com/video.mp4,Sarah,Pending
```

**After (Template Media):**
```csv
Phone,{{1}},{{2}}
919876543210,John,Approved
919876543211,Sarah,Pending
```

Simply remove the Media column and check the "Use template's approved media" box when creating the campaign.

---

## Technical Notes

### Variable Shifting Logic
When using template media, the system automatically shifts variables:

```javascript
// Your CSV provides:
{ phone: '919876543210', var1: 'John', var2: 'Approved' }

// System transforms to:
{
  phone: '919876543210',
  var1: 'https://whatsapp-cdn.url/approved-media',  // Auto-injected
  var2: 'John',                                      // Shifted from var1
  var3: 'Approved'                                   // Shifted from var2
}
```

### Template Media URL Source
The system extracts the approved media URL from:
```javascript
template.components
  .find(c => c.type === 'HEADER')
  .example
  .header_handle[0]
```

This is the same URL that WhatsApp approved when you created/submitted the template.

---

## Troubleshooting

### Issue: "Template media URL not found"
**Cause:** Template doesn't have a media header component or it wasn't approved with media.

**Solution:** Use Option 1 (Custom Media URLs) instead, or re-create the template with media.

### Issue: Messages failing with "Invalid parameter"
**Cause:** CSV column count doesn't match template variable count.

**Solution:**
- Count your template variables ({{1}}, {{2}}, etc.)
- Ensure CSV has phone + same number of data columns
- Remember: Media column doesn't count when using template media

### Issue: "Phone must be exactly 12 digits"
**Cause:** Phone number format is incorrect.

**Solution:**
- Use format: `91` (country code) + `10-digit mobile number`
- Example: `919876543210`
- Remove spaces, dashes, or other characters

---

## API Parameter

When creating a campaign via API, set the `use_template_media` flag:

```javascript
// Option 1: Custom Media URLs
const formData = new FormData();
formData.append('use_template_media', 'false');  // or omit (default is false)

// Option 2: Template's Approved Media
const formData = new FormData();
formData.append('use_template_media', 'true');
```

---

**Last Updated:** 2025-11-10
**Feature Version:** v1.2.0
