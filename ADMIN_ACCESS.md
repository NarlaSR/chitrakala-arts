# 🔒 Admin Access - Secure Instructions

## Security Notice

For security reasons, the admin panel is **not publicly linked** on the website. This is an additional security measure to prevent unauthorized access attempts.

## Admin Access URL

**Login Page**: http://localhost:3000/ckk-secure-admin

**Dashboard**: http://localhost:3000/ckk-secure-admin/dashboard

## Default Credentials

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change these credentials immediately in production!

## Security Best Practices

### 1. Hidden Admin URL
- The admin login is not linked anywhere on the public site
- Only authorized personnel should know this URL
- Bookmark this page privately

### 2. Strong Credentials
Change default password in `server/server.js`:
```javascript
password: await bcrypt.hash('YOUR_STRONG_PASSWORD', 10)
```

### 3. Custom Admin Path
To further customize the admin path, update in these files:
- `src/App.js` - Route paths
- `src/pages/AdminDashboard.js` - Navigate paths
- `src/pages/AdminLogin.js` - Navigate paths

Example: Change `/ckk-secure-admin` to your custom path like `/secret-portal-xyz`

### 4. Additional Security Measures for Production

#### Add Rate Limiting
```javascript
// In server/server.js
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.'
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  // ... login logic
});
```

#### Enable 2FA (Two-Factor Authentication)
Consider adding tools like:
- Google Authenticator
- SMS verification
- Email verification codes

#### IP Whitelisting
Restrict admin access to specific IP addresses:
```javascript
const adminWhitelist = ['192.168.1.100', '203.0.113.0'];

const checkIP = (req, res, next) => {
  const clientIP = req.ip;
  if (!adminWhitelist.includes(clientIP)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

app.use('/api/admin', checkIP);
```

#### Session Timeout
JWT tokens expire after 24 hours by default. For more security:
```javascript
// In server/server.js
const token = jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  JWT_SECRET,
  { expiresIn: '2h' } // Reduce to 2 hours
);
```

## Access Instructions for Admin Users

1. **Save the URL privately**: Bookmark http://localhost:3000/ckk-secure-admin
2. **Never share publicly**: Do not post this URL on social media or public forums
3. **Use strong password**: Change from default immediately
4. **Secure your device**: Keep your computer/phone password-protected
5. **Log out when done**: Always click "Logout" when finished

## Troubleshooting

### Can't Access Admin Panel
1. Verify you're using the correct URL: `/ckk-secure-admin`
2. Check backend server is running
3. Clear browser cache and cookies
4. Try incognito/private browsing mode

### Forgot Password
1. Stop the server
2. Delete `server/data/users.json`
3. Restart server - default admin will be recreated
4. Login with `admin` / `admin123`
5. Immediately change password

## For Production

**Remember to:**
- [ ] Change admin URL path
- [ ] Update admin credentials
- [ ] Set strong JWT_SECRET
- [ ] Enable HTTPS
- [ ] Add rate limiting
- [ ] Consider 2FA
- [ ] Monitor login attempts
- [ ] Keep this document private

---

**Keep this file secure and do not commit it to public repositories!**
