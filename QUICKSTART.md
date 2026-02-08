# 🎨 Chitrakala Arts - Quick Start Guide

## ✅ Setup Complete!

Your interactive art portfolio application is ready with:

- ✨ Frontend React app
- 🔧 Backend Express server
- 🔐 Admin authentication
- 📤 Image upload capability
- 💾 JSON-based storage

---

## 🚀 How to Start

### Option 1: Automatic Start (Windows PowerShell)

```powershell
.\start.ps1
```

### Option 2: Manual Start

**Terminal 1 - Backend:**

```bash
cd server
npm start
```

**Terminal 2 - Frontend:**

```bash
npm start
```

---

## 🌐 Access URLs

- **Website**: http://localhost:3000
- **Admin Login**: http://localhost:3000/admin/login
- **API**: http://localhost:5000/api

---

## 🔑 Admin Credentials

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change these in production!**

---

## 📝 Quick Admin Guide

### 1. Login

- Go to http://localhost:3000/admin/login
- Enter credentials above

### 2. Add Artwork

- Click "+ Add New Artwork"
- Fill in the form:
  - **Title**: Name of artwork
  - **Category**: Choose from dropdown
  - **Description**: Detailed description
  - **Price**: In rupees (₹)
  - **Size**: e.g., "12 x 12 inches"
  - **Materials**: e.g., "Acrylic on canvas"
  - **Image**: Upload artwork photo (max 5MB)
  - **Featured**: Check to show on homepage
- Click "Create Artwork"

### 3. Edit Artwork

- Find artwork in table
- Click "Edit"
- Update fields as needed
- Upload new image (optional)
- Click "Update Artwork"

### 4. Delete Artwork

- Find artwork in table
- Click "Delete"
- Confirm deletion

---

## 🎯 Features You Can Use

### For Visitors:

- Browse artwork by category
- View detailed artwork information
- See prices and specifications
- Contact form

### For Admin:

- Secure login/logout
- Upload artwork images
- Set prices
- Manage all content
- Mark featured artworks
- Full CRUD operations

---

## 📁 Where Files Are Stored

- **Uploaded Images**: `server/uploads/`
- **Artwork Data**: `server/data/artworks.json`
- **Users**: `server/data/users.json`

---

## 🔧 Troubleshooting

### "Port already in use"

If ports are busy:

```bash
# In server/server.js, change:
const PORT = process.env.PORT || 5001;  # Change 5000 to 5001
```

### "Cannot connect to API"

Make sure backend server is running on port 5000.

### "Images not showing"

1. Check backend server is running
2. Verify images in `server/uploads/` folder
3. Check browser console for errors

### Frontend won't start

1. Stop existing React server
2. Delete `node_modules` and run `npm install`
3. Run `npm start` again

---

## 🎨 Next Steps

1. **Login to Admin**: http://localhost:3000/admin/login
2. **Add Your First Artwork**: Click "+ Add New Artwork"
3. **Upload Your Images**: Select image files from your computer
4. **View on Website**: Check homepage for featured items
5. **Browse Categories**: See artwork organized by type

---

## 💡 Tips

- Use high-quality images (1200x1200px recommended)
- Mark best pieces as "Featured" to show on homepage
- Keep descriptions concise but informative
- Update prices regularly
- Check the public site to see changes live

---

## 🆘 Need Help?

Check the main README.md for:

- API endpoints
- Detailed documentation
- Security notes
- Production deployment guide

---

## 🎉 You're All Set!

Your art portfolio is live and ready to manage. Start by logging into the admin dashboard and adding your beautiful artwork!

Happy Creating! 🎨
