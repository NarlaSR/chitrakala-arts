# Email Configuration Setup

This guide will help you set up email functionality for the contact form on Chitrakala Arts website.

## Overview

The contact form uses **Nodemailer** with Gmail SMTP to send emails. Messages sent via the contact form will be delivered to the email addresses configured in the admin panel.

Currently configured email addresses:

- snarla369@gmail.com
- supraja_narla@yahoo.com

## Setting Up Gmail App Password

Since Gmail requires "App Passwords" for third-party applications (not your regular Gmail password), follow these steps:

### Step 1: Enable 2-Factor Authentication

1. Go to your Google Account: https://myaccount.google.com
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google", click **2-Step Verification**
4. Follow the prompts to enable 2-Step Verification (if not already enabled)

### Step 2: Generate App Password

1. Go back to **Security** page
2. Under "Signing in to Google", click **App passwords**
   - If you don't see this option, make sure 2-Step Verification is enabled
3. Click **Select app** and choose **Mail**
4. Click **Select device** and choose **Other (Custom name)**
5. Type "Chitrakala Arts Website" and click **Generate**
6. Google will show you a 16-character password (example: `abcd efgh ijkl mnop`)
7. **Copy this password immediately** - you won't be able to see it again!

### Step 3: Add Environment Variables to Railway

1. Go to your Railway dashboard: https://railway.app
2. Select your **chitrakala-arts** backend project
3. Click on the **Variables** tab
4. Add these two environment variables:
   - **EMAIL_USER**: `snarla369@gmail.com`
   - **EMAIL_PASSWORD**: `[paste the 16-character app password here]`

5. Click **Save** - Railway will automatically redeploy your backend

### Step 4: Test the Contact Form

1. Wait for Railway deployment to complete (~2 minutes)
2. Visit your website: https://chitrakala-arts.vercel.app/contact
3. Fill out the contact form and send a test message
4. Check both email addresses (snarla369@gmail.com and supraja_narla@yahoo.com)
5. You should receive the message within 1-2 minutes

## Spam Prevention Features

The contact form includes multiple layers of spam protection:

1. **Rate Limiting**: Maximum 3 messages per IP address per hour
2. **Honeypot Field**: Hidden field that only bots fill out
3. **Time Validation**: Form must be open for at least 3 seconds
4. **Message Length**: Minimum 20 characters required
5. **Email Validation**: Proper email format required
6. **Server-side Validation**: All checks re-verified on backend

## Changing Email Addresses

You can easily change the recipient email addresses without touching code:

1. Login to admin dashboard: https://chitrakala-arts.vercel.app/ckk-secure-admin/dashboard
2. Click **"Edit Contact Info"** button
3. Under "Email Addresses" section:
   - Modify existing emails
   - Click **"+ Add Another Email"** to add more
   - Click **"Remove"** to delete an email (minimum 1 required)
4. Click **"Save Changes"**

All future contact form submissions will be sent to the updated email addresses.

## Troubleshooting

### "Failed to send message" Error

**Possible causes:**

1. App Password not set in Railway environment variables
2. Incorrect App Password
3. Email address changed in Gmail security settings

**Solution:**

- Double-check EMAIL_USER and EMAIL_PASSWORD variables in Railway
- Regenerate App Password if needed
- Check Railway logs: `railway logs` command

### Not Receiving Emails

**Possible causes:**

1. Emails going to Spam/Junk folder
2. Incorrect email addresses in contact.json
3. Gmail blocking the email

**Solution:**

- Check Spam/Junk folders in both Gmail and Yahoo
- Add chitrakalaarts@gmail.com to your contacts
- Verify email addresses in Admin → Edit Contact Info

### Rate Limit Error

If you see "Too many messages sent", wait 1 hour before trying again. This is a spam protection feature.

## Email Limits

- **Gmail Free Account**: 500 emails per day
- **Current Rate Limit**: 3 emails per hour per IP address

For a small art portfolio website, these limits are more than sufficient. If you need higher limits in the future, consider upgrading to SendGrid or similar service.

## Security Notes

- Never commit EMAIL_PASSWORD to git
- Environment variables are stored securely in Railway
- App Password is different from your Gmail password
- Revoking an App Password doesn't affect your Google account
- Contact form validates all inputs server-side to prevent injection attacks

## Support

If you encounter any issues setting this up, contact your developer or check Railway deployment logs for error details.
