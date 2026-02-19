# Chitra's Kala Kreations - Complete Application Documentation

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Admin Guide](#admin-guide)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Customization](#customization)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)

---

## 📖 Overview

**Chitra's Kala Kreations** is a full-stack interactive art portfolio web application built with React and Express.js. It showcases handcrafted artworks in three main categories: Dot Mandala Art, Lippan Art, and Textile Designing.

The application features:

- Public-facing website for browsing artwork
- Secure admin dashboard for content management
- Image upload functionality
- Full CRUD operations for artwork
- JWT-based authentication
- Responsive design for all devices

---

## ✨ Features

### Public Features

- **Browse Artwork**: View artworks organized by categories
- **Detailed Views**: See artwork with descriptions, prices, sizes, and materials
- **Featured Section**: Highlighted artworks on homepage
- **Category Pages**: Dedicated pages for each art category
- **About Page**: Information about the artist and art forms
- **Contact Form**: Get in touch with inquiries
- **Responsive Design**: Works on desktop, tablet, and mobile devices

### Admin Features

- **Secure Authentication**: JWT-based login system
- **Dashboard**: Manage all artworks from a central location
- **Upload Images**: Upload artwork photos (up to 5MB)
- **Add Artworks**: Create new artwork entries with details
- **Edit Artworks**: Update existing artwork information
- **Delete Artworks**: Remove artworks from the portfolio
- **Set Prices**: Manage artwork pricing
- **Feature Control**: Mark artworks as featured for homepage display
- **Real-time Updates**: Changes reflect immediately on the public site

---

## 🛠️ Technology Stack

### Frontend

- **React** 18.2.0 - UI library
- **React Router DOM** 6.20.0 - Client-side routing
- **Axios** 1.6.2 - HTTP client for API calls
- **CSS3** - Styling with CSS variables
- **React Context API** - State management for authentication

### Backend

- **Node.js** - Runtime environment
- **Express.js** 4.18.2 - Web server framework
- **JWT** (jsonwebtoken 9.0.2) - Authentication tokens
- **Multer** 1.4.5 - File upload handling
- **bcryptjs** 2.4.3 - Password hashing
- **CORS** 2.8.5 - Cross-origin resource sharing

### Storage

- **JSON Files** - Lightweight data storage
- **File System** - Image storage

---

## 📁 Project Structure

```
chitrakala_arts/
│
├── public/                          # Static files
│   ├── index.html                   # HTML template
│   └── assets/
│       └── images/
│           ├── logo.png             # Site logo (280x280px recommended)
│           ├── categories/          # Category images
│           └── artworks/            # Artwork images (deprecated - now in server/uploads)
│
├── server/                          # Backend Express server
│   ├── server.js                    # Main server file with all API routes
│   ├── package.json                 # Backend dependencies
│   ├── data/                        # JSON database
│   │   ├── artworks.json           # Artwork data
│   │   └── users.json              # Admin users
│   └── uploads/                     # Uploaded images
│
├── src/                             # Frontend React application
│   ├── components/                  # Reusable components
│   │   ├── Header.js               # Navigation header with logo
│   │   ├── Footer.js               # Site footer
│   │   ├── ArtCard.js              # Artwork display card
│   │   └── CategoryCard.js         # Category display card
│   │
│   ├── pages/                       # Page components
│   │   ├── Home.js                 # Homepage with hero and featured artworks
│   │   ├── CategoryPage.js         # Category-specific artwork listing
│   │   ├── ArtDetails.js           # Individual artwork detail page
│   │   ├── About.js                # About the artist and art forms
│   │   ├── Contact.js              # Contact form
│   │   ├── AdminLogin.js           # Admin login page
│   │   └── AdminDashboard.js       # Admin control panel
│   │
│   ├── context/                     # React Context
│   │   └── AuthContext.js          # Authentication state management
│   │
│   ├── services/                    # API services
│   │   └── api.js                  # Axios API client and endpoints
│   │
│   ├── data/                        # Static data
│   │   └── artData.js              # Category definitions
│   │
│   ├── styles/                      # CSS files
│   │   ├── index.css               # Global styles and CSS variables
│   │   ├── App.css                 # Main app styles
│   │   ├── Header.css              # Header component styles
│   │   ├── Footer.css              # Footer component styles
│   │   ├── Home.css                # Homepage styles
│   │   ├── CategoryPage.css        # Category page styles
│   │   ├── ArtDetails.css          # Art details page styles
│   │   ├── About.css               # About page styles
│   │   ├── Contact.css             # Contact page styles
│   │   ├── ArtCard.css             # Art card component styles
│   │   ├── CategoryCard.css        # Category card component styles
│   │   ├── AdminLogin.css          # Admin login page styles
│   │   ├── AdminDashboard.css      # Admin dashboard styles
│   │   └── Utils.css               # Utility styles
│   │
│   ├── App.js                       # Main app component with routing
│   └── index.js                     # React entry point
│
├── package.json                     # Frontend dependencies
├── .gitignore                       # Git ignore rules
├── README.md                        # Project overview
├── QUICKSTART.md                    # Quick start guide
├── start.ps1                        # Windows PowerShell startup script
└── PROJECT_DOCUMENTATION.md         # This file

```

---

## 🚀 Installation & Setup

### Prerequisites

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **Git** (optional, for version control)

### Step 1: Install Frontend Dependencies

```bash
cd chitrakala_arts
npm install
```

This installs:

- react
- react-dom
- react-router-dom
- axios
- react-scripts

### Step 2: Install Backend Dependencies

```bash
cd server
npm install
```

This installs:

- express
- cors
- jsonwebtoken
- bcryptjs
- multer

### Step 3: Add Your Logo (Optional)

Place your logo image at:

```
public/assets/images/logo.png
```

Recommended size: 280x280px (PNG format with transparency)

---

## 🎬 Running the Application

### Option 1: Automatic Start (Windows)

```powershell
.\start.ps1
```

This script will:

1. Start the backend server on port 5000
2. Start the frontend on port 3000
3. Open both in separate terminal windows

### Option 2: Manual Start

**Terminal 1 - Backend Server:**

```bash
cd server
npm start
```

Server runs at: http://localhost:5000

**Terminal 2 - Frontend Application:**

```bash
npm start
```

Frontend runs at: http://localhost:3000

### Access URLs

- **Public Website**: http://localhost:3000
- **Admin Login**: http://localhost:3000/admin/login
- **Backend API**: http://localhost:5000/api
- **Uploaded Images**: http://localhost:5000/uploads

---

## 👨‍💼 Admin Guide

### Accessing Admin Panel

1. Navigate to: http://localhost:3000/admin/login
2. Use default credentials:
   - **Username**: `admin`
   - **Password**: `admin123`
3. Click "Sign In"

⚠️ **Security Note**: Change these credentials immediately in production!

### Dashboard Overview

After login, you'll see:

- **Total artworks count**
- **Add New Artwork button**
- **Artworks table** with all entries
- **Edit/Delete actions** for each artwork

### Adding New Artwork

1. Click **"+ Add New Artwork"** button
2. Fill in the form:
   - **Title**: Name of the artwork
   - **Category**: Select from dropdown
     - Dot Mandala Art (dot-mandala)
     - Lippan Art (lippan-art)
     - Textile Designing (textile-design)
   - **Description**: Detailed description (displayed on detail page)
   - **Price**: In rupees (₹)
   - **Size**: Dimensions (e.g., "12 x 12 inches")
   - **Materials**: What it's made of (e.g., "Acrylic on canvas")
   - **Image**: Upload photo (JPG, PNG, or GIF, max 5MB)
   - **Featured**: Check to display on homepage
3. Click **"Create Artwork"**
4. Artwork immediately appears on the public site

### Editing Artwork

1. Find artwork in the table
2. Click **"Edit"** button
3. Form pre-fills with current data
4. Modify any fields as needed
5. Upload new image (optional - keeps existing if not changed)
6. Click **"Update Artwork"**

### Deleting Artwork

1. Find artwork in the table
2. Click **"Delete"** button
3. Confirm deletion in the popup
4. Artwork and associated image are removed permanently

### Featured Artworks

- Check "Featured Artwork" when creating/editing
- Featured artworks appear in the "Featured Artworks" section on homepage
- Useful for highlighting best pieces or new additions

### Logging Out

Click **"Logout"** button in the top right of the dashboard

---

## 🔌 API Documentation

### Base URL

```
http://localhost:5000/api
```

### Authentication Endpoints

#### POST /api/auth/login

Login to admin account

**Request Body:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (Success):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "admin-1",
    "username": "admin",
    "role": "admin"
  }
}
```

**Response (Error):**

```json
{
  "error": "Invalid credentials"
}
```

#### GET /api/auth/verify

Verify JWT token validity

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "valid": true,
  "user": {
    "id": "admin-1",
    "username": "admin",
    "role": "admin"
  }
}
```

### Artwork Endpoints

#### GET /api/artworks

Get all artworks (public)

**Response:**

```json
[
  {
    "id": "art-1234567890",
    "title": "Celestial Harmony",
    "category": "dot-mandala",
    "description": "A stunning dot mandala...",
    "price": 2500,
    "size": "12\" x 12\"",
    "materials": "Acrylic on canvas",
    "image": "/uploads/1234567890-image.jpg",
    "featured": true,
    "createdAt": "2026-02-06T10:30:00.000Z"
  }
]
```

#### GET /api/artworks/:id

Get specific artwork by ID (public)

**Response:**

```json
{
  "id": "art-1234567890",
  "title": "Celestial Harmony",
  "category": "dot-mandala",
  "description": "A stunning dot mandala...",
  "price": 2500,
  "size": "12\" x 12\"",
  "materials": "Acrylic on canvas",
  "image": "/uploads/1234567890-image.jpg",
  "featured": true
}
```

#### POST /api/artworks

Create new artwork (admin only)

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**

- title: string (required)
- category: string (required)
- description: string (required)
- price: number (required)
- size: string (required)
- materials: string (required)
- image: file (required)
- featured: boolean (optional, default: false)

**Response:**

```json
{
  "id": "art-1234567890",
  "title": "New Artwork",
  "category": "dot-mandala",
  "price": 3000,
  "image": "/uploads/1234567890-image.jpg",
  "createdAt": "2026-02-06T10:30:00.000Z"
}
```

#### PUT /api/artworks/:id

Update existing artwork (admin only)

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:** (all optional)

- title: string
- category: string
- description: string
- price: number
- size: string
- materials: string
- image: file
- featured: boolean

**Response:**

```json
{
  "id": "art-1234567890",
  "title": "Updated Title",
  "updatedAt": "2026-02-06T11:00:00.000Z"
}
```

#### DELETE /api/artworks/:id

Delete artwork (admin only)

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "message": "Artwork deleted successfully"
}
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env` file in the `server/` directory:

```env
PORT=5000
JWT_SECRET=your-super-secret-key-change-this-in-production
```

### Default Admin Credentials

Located in `server/server.js`:

```javascript
const defaultAdmin = {
  id: "admin-1",
  username: "admin",
  password: await bcrypt.hash("admin123", 10),
};
```

To change:

1. Delete `server/data/users.json`
2. Modify credentials in `server/server.js`
3. Restart server

### File Upload Limits

In `server/server.js`:

```javascript
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    // ... validation
  },
});
```

### CORS Configuration

In `server/server.js`:

```javascript
app.use(cors()); // Allow all origins in development
```

For production:

```javascript
app.use(
  cors({
    origin: "https://yourdomain.com",
    credentials: true,
  }),
);
```

---

## 🎨 Customization

### Color Scheme

Edit `src/styles/index.css`:

```css
:root {
  --primary-color: #8b4513; /* Brown */
  --secondary-color: #d4af37; /* Gold */
  --accent-color: #c19a6b; /* Tan */
  --text-dark: #2c2c2c; /* Dark Gray */
  --text-light: #666; /* Light Gray */
  --bg-light: #f9f6f1; /* Cream */
  --white: #ffffff;
  --border-color: #e5e5e5;
}
```

### Site Name

Already updated to "Chitra's Kala Kreations" in:

- `src/components/Header.js`
- `src/pages/Home.js`
- `public/index.html` (update title tag)

### Logo

Replace: `public/assets/images/logo.png`

- Desktop hero: 280x280px
- Header: 80x80px (auto-scaled)
- Mobile hero: 180x180px
- Mobile header: 60x60px (auto-scaled)

### Categories

Add new categories in `src/data/artData.js`:

```javascript
export const categories = [
  {
    id: "new-category",
    name: "New Category Name",
    description: "Description here",
    image: "/assets/images/categories/new-category.jpg",
  },
];
```

Then add route in `src/App.js` navigation.

---

## 🔒 Security

### Current Security Features

- JWT token authentication
- Password hashing with bcrypt
- File upload validation (type and size)
- Protected admin routes
- Token expiration (24 hours)

### Security Best Practices for Production

1. **Change Default Credentials**

   ```javascript
   // In server/server.js
   password: await bcrypt.hash("STRONG_PASSWORD_HERE", 10);
   ```

2. **Use Strong JWT Secret**

   ```env
   JWT_SECRET=use-a-long-random-string-at-least-32-characters
   ```

3. **Enable HTTPS**
   - Use Let's Encrypt for SSL certificates
   - Configure reverse proxy (Nginx)

4. **Implement Rate Limiting**

   ```bash
   npm install express-rate-limit
   ```

5. **Add Input Validation**

   ```bash
   npm install express-validator
   ```

6. **Secure Headers**

   ```bash
   npm install helmet
   ```

7. **Environment Variables**
   - Never commit `.env` files
   - Use different secrets for dev/prod

8. **Regular Updates**
   ```bash
   npm audit
   npm audit fix
   ```

---

## 🐛 Troubleshooting

### Port Already in Use

**Problem**: Error: listen EADDRINUSE: address already in use :::5000

**Solution**:

```bash
# Change port in server/server.js
const PORT = process.env.PORT || 5001;
```

### Frontend Can't Connect to Backend

**Problem**: Network Error or CORS errors

**Solution**:

1. Ensure backend is running on port 5000
2. Check `proxy` in `package.json`: `"proxy": "http://localhost:5000"`
3. Verify CORS is enabled in `server/server.js`

### Images Not Loading

**Problem**: Images show broken icon

**Solution**:

1. Check backend server is running
2. Verify images exist in `server/uploads/`
3. Check image URLs in browser console
4. Ensure image paths start with `http://localhost:5000/uploads/`

### Login Fails

**Problem**: "Invalid credentials" error

**Solution**:

1. Verify username: `admin` and password: `admin123`
2. Check `server/data/users.json` exists
3. Delete users.json and restart server to recreate default admin
4. Check browser console for errors

### Module Not Found

**Problem**: Cannot find module 'axios' or similar

**Solution**:

```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

### React App Won't Start

**Problem**: Compilation errors

**Solution**:

1. Delete `node_modules` and `package-lock.json`
2. Run `npm install`
3. Check for syntax errors in recent changes
4. Clear browser cache

### File Upload Fails

**Problem**: Error uploading images

**Solution**:

1. Check file size (must be under 5MB)
2. Verify file type (JPG, PNG, GIF only)
3. Ensure `server/uploads/` directory exists
4. Check disk space
5. Verify file permissions

---

## 🚀 Production Deployment

### Pre-Deployment Checklist

- [ ] Change admin credentials
- [ ] Set strong JWT_SECRET
- [ ] Configure proper CORS origins
- [ ] Set up environment variables
- [ ] Replace JSON database with PostgreSQL/MongoDB
- [ ] Configure file storage (AWS S3, Cloudinary)
- [ ] Add error logging (Winston, Sentry)
- [ ] Implement rate limiting
- [ ] Add input validation
- [ ] Enable HTTPS
- [ ] Set up backup system
- [ ] Configure monitoring

### Build Frontend

```bash
npm run build
```

This creates optimized production build in `build/` directory.

### Serve Frontend from Backend

In `server/server.js`:

```javascript
const path = require("path");

// Serve static files from React build
app.use(express.static(path.join(__dirname, "../build")));

// Handle React routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});
```

### Database Migration

Replace JSON files with a real database:

**PostgreSQL Example:**

```javascript
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

**MongoDB Example:**

```javascript
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGODB_URI);
```

### Cloud Storage for Images

**AWS S3 Example:**

```javascript
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

const uploadToS3 = (file) => {
  return s3
    .upload({
      Bucket: process.env.S3_BUCKET,
      Key: file.filename,
      Body: file.buffer,
    })
    .promise();
};
```

### Hosting Options

1. **Vercel** (Frontend)
   - Free tier available
   - Automatic deployments from Git
   - Great for React apps

2. **Heroku** (Full Stack)
   - Free tier available (limited)
   - Easy deployment
   - Add-ons for database

3. **AWS EC2** (Full Control)
   - Complete server control
   - Scalable
   - Requires more setup

4. **DigitalOcean** (VPS)
   - Simple droplets
   - Good pricing
   - Good documentation

5. **Railway** (Backend)
   - Free tier
   - Easy deployment
   - PostgreSQL included

### Deployment Commands

```bash
# Build frontend
npm run build

# Start production server
cd server
NODE_ENV=production npm start
```

---

## 📞 Support & Maintenance

### Regular Maintenance Tasks

1. **Weekly**
   - Check error logs
   - Monitor disk space
   - Review new artwork submissions

2. **Monthly**
   - Update dependencies (`npm update`)
   - Run security audit (`npm audit`)
   - Backup database and images
   - Review analytics

3. **Quarterly**
   - Review and update content
   - Check for broken links
   - Performance optimization
   - Security review

### Backup Strategy

```bash
# Backup artworks data
cp server/data/artworks.json backups/artworks-$(date +%Y%m%d).json

# Backup uploaded images
tar -czf backups/uploads-$(date +%Y%m%d).tar.gz server/uploads/
```

### Monitoring

Recommended tools:

- **Uptime**: UptimeRobot, Pingdom
- **Analytics**: Google Analytics, Plausible
- **Errors**: Sentry, LogRocket
- **Performance**: Lighthouse, WebPageTest

---

## 📄 License

This project was created for Chitra's Kala Kreations portfolio purposes.

---

## 🎉 Conclusion

You now have a complete, interactive art portfolio website with:

- Beautiful public-facing pages
- Secure admin dashboard
- Image upload and management
- Full CRUD operations
- Responsive design
- Professional styling

**Next Steps:**

1. Add your logo to `public/assets/images/logo.png`
2. Login to admin dashboard
3. Upload your first artwork
4. Customize colors and content
5. Share your portfolio with the world!

---

**Built with ❤️ for Chitra's Kala Kreations**

_Last Updated: February 6, 2026_
