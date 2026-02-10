# Resend Email Setup for Railway

## Why Resend Instead of Gmail?

Railway (and many PaaS platforms) block SMTP ports (587, 465) to prevent spam abuse. Gmail requires SMTP, so it cannot work on Railway. Resend uses standard HTTPS (port 443) which works everywhere.

## Railway Environment Variables Setup

1. **Go to Railway Dashboard**: https://railway.app/dashboard
2. **Select your project**: chitrakalaarts-production
3. **Click on the backend service**
4. **Go to Variables tab**

### Add This Variable:

**RESEND_API_KEY**

```
re_EYMtGKK2_7kxPdjdbBb6c7DUf6oW9W53z
```

### Remove These Variables (No Longer Needed):

- ~~EMAIL_USER~~ (Gmail - no longer used)
- ~~EMAIL_PASSWORD~~ (Gmail App Password - no longer used)

### Keep These Variables:

- **BASE_URL**: https://chitrakalaarts-production.up.railway.app
- **JWT_SECRET**: (your existing value)
- **RESET_ADMIN**: false (or remove entirely after admin user is working)

## After Adding RESEND_API_KEY

Railway will automatically redeploy your backend when you add the environment variable. This takes about 2-3 minutes.

## Testing the Contact Form

1. Visit: https://chitrakala-arts.vercel.app/contact
2. Fill out the form with a test message (minimum 20 characters)
3. Click "Send Message"
4. You should see green success message
5. Check both email addresses:
   - snarla369@gmail.com
   - supraja_narla@yahoo.com
6. Emails should arrive within 1-2 minutes

## Email Details

- **From Address**: Chitrakala Arts <onboarding@resend.dev>
  - This is Resend's default sending address for testing
  - To use a custom email (like info@chitrakalaarts.com), you need to verify a domain in Resend
  - Current setup works perfectly for contact forms

- **To Addresses**: Both admin emails from contact.json
- **Reply-To**: Customer's email address (so you can click reply in your inbox)

## Troubleshooting

**If emails don't arrive:**

1. Check Railway logs: `railway logs`
2. Look for "Error sending message" in logs
3. Verify RESEND_API_KEY is exactly: re_EYMtGKK2_7kxPdjdbBb6c7DUf6oW9W53z (no extra spaces)
4. Check spam/junk folders in both email accounts

**To verify API key is working:**
Railway logs will show either:

- ✅ Success: No error messages about email sending
- ❌ Error: "Invalid API key" or similar Resend error

## Resend Account Details

- **Free Tier**: 3,000 emails per month (vs Gmail's 500/day)
- **Faster**: HTTP API is faster than SMTP
- **More Reliable**: No SMTP connection issues
- **Better for Production**: Built for transactional emails

## Next Steps After Email Works

Once contact form is working:

1. ✅ Phase 1 Complete: Contact CMS + Email
2. 🔜 Phase 2: Footer/Site Settings CMS
3. 🔜 Phase 3: Multiple Images per Artwork
4. 🔜 Phase 4: Showcase Gallery + Videos

## Contact Email Management

To add/change email addresses later:

1. Go to: https://chitrakala-arts.vercel.app/ckk-secure-admin/dashboard
2. Login: admin / sonu@786
3. Click "Edit Contact Info"
4. Add/remove email addresses as needed
5. Click "Save Changes"

All contact form submissions will be sent to all email addresses listed.
