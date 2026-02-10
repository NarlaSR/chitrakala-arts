const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { rateLimit } = require('express-rate-limit');
const { initializeDatabase, isDatabaseConfigured } = require('./db');
const db = require('./dbQueries');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Check if using database or JSON files
const USE_DATABASE = !!process.env.DATABASE_URL;

// Trust Railway proxy to get correct IP addresses for rate limiting
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Configure Resend for email sending (HTTP-based, bypasses Railway SMTP blocking)
const resend = new Resend(process.env.RESEND_API_KEY);

// Rate limiter for contact form (3 submissions per hour per IP)
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many messages sent. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize default admin user in database
const initializeDefaultAdmin = async () => {
  try {
    const users = await db.getUsers();
    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.createUser('admin-1', 'admin', hashedPassword, 'admin');
      console.log('✅ Default admin created - username: admin, password: admin123');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await db.getUserByUsername(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Artwork Routes

// Get all artworks (public)
app.get('/api/artworks', async (req, res) => {
  try {
    const artworks = await db.getArtworks();
    res.json(artworks);
  } catch (error) {
    console.error('Error reading artworks:', error);
    res.status(500).json({ error: 'Failed to fetch artworks' });
  }
});

// Get artwork by ID (public)
app.get('/api/artworks/:id', async (req, res) => {
  try {
    const artwork = await db.getArtworkById(req.params.id);
    
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }
    
    res.json(artwork);
  } catch (error) {
    console.error('Error reading artwork:', error);
    res.status(500).json({ error: 'Failed to fetch artwork' });
  }
});

// Create new artwork (admin only)
app.post('/api/artworks', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const newArtwork = {
      id: `art-${Date.now()}`,
      title: req.body.title,
      category: req.body.category,
      description: req.body.description,
      price: parseFloat(req.body.price),
      dimensions: req.body.size,
      materials: req.body.materials,
      image: req.file ? `${BASE_URL}/uploads/${req.file.filename}` : '',
      featured: req.body.featured === 'true'
    };

    const artwork = await db.createArtwork(newArtwork);
    res.status(201).json(artwork);
  } catch (error) {
    console.error('Error creating artwork:', error);
    res.status(500).json({ error: 'Failed to create artwork' });
  }
});

// Update artwork (admin only)
app.put('/api/artworks/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const existingArtwork = await db.getArtworkById(req.params.id);
    
    if (!existingArtwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const updatedArtwork = {
      title: req.body.title || existingArtwork.title,
      category: req.body.category || existingArtwork.category,
      description: req.body.description || existingArtwork.description,
      price: req.body.price ? parseFloat(req.body.price) : existingArtwork.price,
      dimensions: req.body.size || existingArtwork.dimensions,
      materials: req.body.materials || existingArtwork.materials,
      featured: req.body.featured !== undefined ? req.body.featured === 'true' : existingArtwork.featured,
      image: existingArtwork.image
    };

    // Update image if new one is uploaded
    if (req.file) {
      // Delete old image if exists
      if (existingArtwork.image) {
        const imageUrl = existingArtwork.image;
        const filename = imageUrl.includes('/uploads/') 
          ? imageUrl.split('/uploads/')[1] 
          : imageUrl.replace('/uploads/', '');
        const oldImagePath = path.join(__dirname, 'uploads', filename);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      updatedArtwork.image = `${BASE_URL}/uploads/${req.file.filename}`;
    }

    const artwork = await db.updateArtwork(req.params.id, updatedArtwork);
    res.json(artwork);
  } catch (error) {
    console.error('Error updating artwork:', error);
    res.status(500).json({ error: 'Failed to update artwork' });
  }
});

// Delete artwork (admin only)
app.delete('/api/artworks/:id', authenticateToken, async (req, res) => {
  try {
    const artwork = await db.getArtworkById(req.params.id);
    
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    // Delete associated image file
    if (artwork.image) {
      const imageUrl = artwork.image;
      const filename = imageUrl.includes('/uploads/') 
        ? imageUrl.split('/uploads/')[1] 
        : imageUrl.replace('/uploads/', '');
      const imagePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await db.deleteArtwork(req.params.id);
    res.json({ message: 'Artwork deleted successfully' });
  } catch (error) {
    console.error('Error deleting artwork:', error);
    res.status(500).json({ error: 'Failed to delete artwork' });
  }
});

// Contact Page Routes

// Get contact info (public)
app.get('/api/contact', async (req, res) => {
  try {
    const contact = await db.getContact();
    if (!contact) {
      return res.status(404).json({ error: 'Contact information not found' });
    }
    res.json(contact);
  } catch (error) {
    console.error('Error reading contact info:', error);
    res.status(500).json({ error: 'Failed to fetch contact information' });
  }
});

// Update contact info (admin only)
app.put('/api/contact', authenticateToken, async (req, res) => {
  try {
    const contactData = req.body;
    await db.updateContact(contactData);
    res.json({ message: 'Contact information updated successfully', data: contactData });
  } catch (error) {
    console.error('Error updating contact info:', error);
    res.status(500).json({ error: 'Failed to update contact information' });
  }
});

// Send contact form message with spam prevention
app.post('/api/contact/send-message', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message, honeypot, timestamp } = req.body;

    // Spam prevention checks
    if (honeypot) {
      return res.status(400).json({ error: 'Spam detected' });
    }

    const submissionTime = Date.now();
    if (timestamp && (submissionTime - timestamp < 3000)) {
      return res.status(400).json({ error: 'Form submitted too quickly' });
    }

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (message.trim().length < 20) {
      return res.status(400).json({ error: 'Message must be at least 20 characters long' });
    }

    // Get admin emails from database
    const contactData = await db.getContact();
    const adminEmails = contactData?.emails || ['snarla369@gmail.com'];

    const mailOptions = {
      from: 'Chitrakala Arts <onboarding@resend.dev>',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8b5a3c;">New Contact Form Submission</h2>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
          </div>
          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
          <div style="margin-top: 20px; padding: 10px; background-color: #f9f9f9; border-radius: 5px; font-size: 12px; color: #666;">
            <p><strong>Submission Details:</strong></p>
            <p>IP Address: ${req.ip}</p>
            <p>Time: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `
    };

    const recipientEmail = [adminEmails[0]];
    
    const result = await resend.emails.send({
      from: 'Chitrakala Arts <onboarding@resend.dev>',
      to: recipientEmail,
      replyTo: email,
      subject: `New Contact Form: ${subject}`,
      html: mailOptions.html
    });

    console.log('Email sent successfully via Resend. ID:', result.data?.id || result.id || 'N/A');
    res.json({ message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
});

// Site Settings Routes

// Get site settings (public)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    if (!settings) {
      return res.status(404).json({ error: 'Site settings not found' });
    }
    res.json(settings);
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to fetch site settings' });
  }
});

// Update site settings (admin only)
app.put('/api/settings', authenticateToken, upload.single('developerLogo'), async (req, res) => {
  try {
    const settingsData = JSON.parse(req.body.settings || '{}');
    
    // If a new developer logo was uploaded, update the logo URL
    if (req.file) {
      // Delete old logo if exists
      const oldSettings = await db.getSettings();
      if (oldSettings && oldSettings.developer && oldSettings.developer.logo) {
        const oldLogoUrl = oldSettings.developer.logo;
        if (oldLogoUrl.includes('/uploads/')) {
          const filename = oldLogoUrl.split('/uploads/')[1];
          const oldLogoPath = path.join(__dirname, 'uploads', filename);
          if (fs.existsSync(oldLogoPath)) {
            fs.unlinkSync(oldLogoPath);
          }
        }
      }
      settingsData.developer.logo = `${BASE_URL}/uploads/${req.file.filename}`;
    }
    
    await db.updateSettings(settingsData);
    res.json({ message: 'Site settings updated successfully', data: settingsData });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update site settings' });
  }
});

// About Page Routes

// Get about page content (public)
app.get('/api/about', async (req, res) => {
  try {
    const about = await db.getAbout();
    if (!about) {
      return res.status(404).json({ error: 'About page content not found' });
    }
    res.json(about);
  } catch (error) {
    console.error('Error reading about page:', error);
    res.status(500).json({ error: 'Failed to fetch about page' });
  }
});

// Update about page content (admin only)
app.put('/api/about', authenticateToken, async (req, res) => {
  try {
    const aboutData = req.body;
    await db.updateAbout(aboutData);
    res.json({ message: 'About page updated successfully', data: aboutData });
  } catch (error) {
    console.error('Error updating about page:', error);
    res.status(500).json({ error: 'Failed to update about page' });
  }
});

// Upload story image (admin only)
app.post('/api/about/upload-image', authenticateToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const imageUrl = `${BASE_URL}/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Error uploading story image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    console.log('Running data migration...');
    // Migration will be run separately
    await initializeDefaultAdmin();

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
      console.log(`Uploads available at http://localhost:${PORT}/uploads`);
      console.log(`Database: PostgreSQL (${process.env.DATABASE_URL ? 'Connected' : 'Not configured'})`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
