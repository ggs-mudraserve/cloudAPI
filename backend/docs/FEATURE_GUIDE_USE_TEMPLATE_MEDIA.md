# Feature Guide: Use Template's Approved Media

## Overview

This feature allows you to choose whether to use custom media URLs from your CSV or the template's WhatsApp-approved CDN media when creating campaigns.

---

## What You'll See in the UI

When creating a new campaign, you'll now see a **checkbox option** after the CSV file upload:

```
┌─────────────────────────────────────────────────────────────┐
│  ☐ Use template's approved media                           │
│                                                             │
│  CSV Format: Phone, MediaURL, Variable1, Variable2, ...    │
│  (Include media URL column with your custom media links)   │
└─────────────────────────────────────────────────────────────┘
```

When you **CHECK** the box, it changes to:

```
┌─────────────────────────────────────────────────────────────┐
│  ☑ Use template's approved media                           │
│                                                             │
│  CSV Format: Phone, Variable1, Variable2, ...              │
│  (No media column needed - system will use WhatsApp's      │
│   approved CDN URL)                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## How to Use

### Scenario 1: Custom Media URLs (Default)

**When to use:** You have different media files for each recipient

**Steps:**
1. Leave the checkbox **UNCHECKED**
2. Prepare CSV with media URLs:
   ```csv
   Phone,MediaURL,Name,Status
   919876543210,https://your-cdn.com/video1.mp4,John,Approved
   919876543211,https://your-cdn.com/video2.mp4,Sarah,Pending
   ```
3. Upload CSV and create campaign

**Result:** Each recipient gets their custom media URL from the CSV

---

### Scenario 2: Template's Approved Media (NEW)

**When to use:** All recipients should get the same WhatsApp-approved media

**Steps:**
1. **CHECK** the checkbox "Use template's approved media"
2. Prepare CSV **WITHOUT** media column:
   ```csv
   Phone,Name,Status
   919876543210,John,Approved
   919876543211,Sarah,Pending
   ```
3. Upload CSV and create campaign

**Result:** All recipients get the WhatsApp CDN media URL that was approved with the template

---

## Visual Comparison

### Before (Checkbox Unchecked)
```
CSV Structure:
┌──────────────┬──────────────────────────┬────────┬──────────┐
│ Phone        │ MediaURL                 │ Name   │ Status   │
├──────────────┼──────────────────────────┼────────┼──────────┤
│ 919876543210 │ https://cdn.com/vid1.mp4 │ John   │ Approved │
│ 919876543211 │ https://cdn.com/vid2.mp4 │ Sarah  │ Pending  │
└──────────────┴──────────────────────────┴────────┴──────────┘

Template receives:
  var1 = https://cdn.com/vid1.mp4 (from CSV)
  var2 = John (from CSV)
  var3 = Approved (from CSV)
```

### After (Checkbox Checked)
```
CSV Structure:
┌──────────────┬────────┬──────────┐
│ Phone        │ Name   │ Status   │
├──────────────┼────────┼──────────┤
│ 919876543210 │ John   │ Approved │
│ 919876543211 │ Sarah  │ Pending  │
└──────────────┴────────┴──────────┘

Template receives:
  var1 = https://whatsapp-cdn.url/approved-media (AUTO-INJECTED)
  var2 = John (from CSV, shifted from var1)
  var3 = Approved (from CSV, shifted from var2)
```

---

## Benefits of Each Approach

### Custom Media (Unchecked)
✅ Different media per recipient
✅ Full control over content
✅ Can change media anytime
❌ Must host media yourself
❌ Longer CSV files

### Template Media (Checked)
✅ Simpler CSV (one less column)
✅ WhatsApp-approved media (faster delivery)
✅ No hosting costs
✅ Same quality for all
❌ Can't customize per recipient
❌ Changing media requires template re-approval

---

## Example Use Cases

### Use Custom Media When:
- Running personalized video campaigns (different videos per customer)
- A/B testing different media content
- Dynamic content based on customer segment
- Using external CDN for analytics

### Use Template Media When:
- Sending same promotional video to all customers
- Template already has perfect media approved
- Want to simplify CSV management
- Avoiding media hosting complexity

---

## Troubleshooting

### "Template media URL not found"
**Problem:** Template doesn't have media or wasn't approved with media
**Solution:**
1. Uncheck the box and use custom media URLs instead, OR
2. Re-create/update the template with media and get it approved

### Messages still failing
**Problem:** CSV format doesn't match checkbox state
**Solution:**
- If checkbox is **CHECKED**: Remove media column from CSV
- If checkbox is **UNCHECKED**: Add media column to CSV

### Wrong variable mapping
**Problem:** Template shows wrong values (e.g., name showing where status should be)
**Solution:**
- Count your template variables: {{1}}, {{2}}, {{3}}, etc.
- Ensure CSV has **exact same number** of data columns (excluding phone)
- When checkbox is checked, remember you're providing one less column (no media)

---

## Technical Details

### What Happens Behind the Scenes

When you check "Use template's approved media":

1. **System fetches** the approved media URL from template's WhatsApp configuration
2. **Auto-injects** it as the first variable (var1)
3. **Shifts** all your CSV variables by one position

```javascript
// Your CSV data
{ phone: '919876543210', var1: 'John', var2: 'Approved' }

// System transforms to
{
  phone: '919876543210',
  var1: 'https://whatsapp-approved-cdn.url/media',  // Injected
  var2: 'John',                                      // Shifted
  var3: 'Approved'                                   // Shifted
}
```

### Where Media URL Comes From

The system extracts it from:
```
Template → Components → HEADER → Example → header_handle[0]
```

This is the exact URL that Meta/WhatsApp approved when you created the template.

---

## FAQ

**Q: Can I mix both approaches in one campaign?**
A: No. You must choose one approach per campaign. All contacts in that campaign will use the same method.

**Q: Does this affect scheduled campaigns?**
A: No difference. Works the same for immediate and scheduled campaigns.

**Q: Can I change the template media URL?**
A: No. The system uses whatever WhatsApp approved. To change it, you must re-submit the template to WhatsApp.

**Q: What if my template has no media?**
A: The checkbox won't help. Leave it unchecked and provide media URLs in your CSV.

**Q: Does this work with images and documents too?**
A: Yes! Works with any media type (image, video, document) in the template header.

---

## Support

For detailed CSV format examples, see: `/root/cloudAPI/backend/docs/CSV_FORMAT_GUIDE.md`

For issues or questions, check the application logs:
```bash
pm2 logs whatsapp-app
```

---

**Last Updated:** 2025-11-10
**Feature Version:** v1.2.0
