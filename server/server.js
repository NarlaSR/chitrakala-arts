require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { rateLimit } = require('express-rate-limit');
const sharp = require('sharp');
const { initializeDatabase, isDatabaseConfigured } = require('./db');
const db = require('./dbQueries');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Security warning for default JWT secret
if (JWT_SECRET === 'your-secret-key-change-in-production') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET! Set JWT_SECRET environment variable in production!');
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL: Cannot run in production with default JWT_SECRET!');
    process.exit(1);
  }
}

// Check if using database or JSON files
const USE_DATABASE = !!process.env.DATABASE_URL;

// Trust Railway proxy to get correct IP addresses for rate limiting
app.set('trust proxy', 1);

// CORS configuration - restrict to your domains
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5000',
  'https://chitrakalaarts-production.up.railway.app',
  'https://chitrakala-arts.vercel.app', // Add your actual Vercel frontend URL
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Debug log for CORS
    console.log('CORS request origin:', origin);
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'");
  next();
});

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// Rate limiter for login endpoint (prevent brute force attacks)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize default admin user in database
const initializeDefaultAdmin = async () => {
  try {
    const users = await db.getUsers();
    if (users.length === 0) {
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await db.createUser('admin-1', 'admin', hashedPassword, 'admin');
      console.log('✅ Default admin created - username: admin');
      console.warn('⚠️  IMPORTANT: Change default admin password immediately!');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// Input validation helpers
const validateString = (str, minLength = 1, maxLength = 1000) => {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  return trimmed.length >= minLength && trimmed.length <= maxLength;
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && email.length <= 254 && emailRegex.test(email);
};

const validatePrice = (price) => {
  const num = parseFloat(price);
  return !isNaN(num) && num >= 0 && num <= 999999.99;
};

const validateArtworkId = (id) => {
  return typeof id === 'string' && /^art-\d+$/.test(id);
};

// Helper function to compress and optimize images
const compressImage = async (inputBuffer) => {
  try {
    return await sharp(inputBuffer)
      .resize(1920, 1920, { 
        fit: 'inside', 
        withoutEnlargement: true // Don't upscale smaller images
      })
      .jpeg({ quality: 85, mozjpeg: true }) // High quality JPEG compression
      .toBuffer();
  } catch (error) {
    console.error('Error compressing image:', error);
    // Return original if compression fails
    return inputBuffer;
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
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!validateString(username, 3, 50)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }
    if (!validateString(password, 6, 100)) {
      return res.status(400).json({ error: 'Invalid password format' });
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

// Image serving routes (serve images from database)
app.get('/api/images/artworks/:id', async (req, res) => {
  try {
    const imageData = await db.getArtworkImage(req.params.id);
    if (!imageData || !imageData.image_data) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.setHeader('Content-Type', imageData.image_mime_type || 'image/jpeg');
    // Disable browser caching so cache-busting works
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(imageData.image_data);
  } catch (error) {
    console.error('Error serving artwork image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

app.get('/api/images/about', async (req, res) => {
  try {
    const imageData = await db.getAboutImage();
    if (!imageData || !imageData.story_image_data) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.setHeader('Content-Type', imageData.story_image_mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(imageData.story_image_data);
  } catch (error) {
    console.error('Error serving about image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

app.get('/api/images/logo', async (req, res) => {
  try {
    const imageData = await db.getLogoImage();
    if (!imageData || !imageData.logo_data) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.setHeader('Content-Type', imageData.logo_mime_type || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(imageData.logo_data);
  } catch (error) {
    console.error('Error serving logo image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Artwork Routes

// Get all artworks (public)
app.get('/api/artworks', async (req, res) => {
  try {
    const artworks = await db.getArtworks();
    // Transform each artwork: remove image_data, add updatedAt, remove updated_at
    const transformed = artworks.map(artwork => {
      if ('image_data' in artwork) delete artwork.image_data;
      artwork.updatedAt = artwork.updated_at || null;
      delete artwork.updated_at;
      return artwork;
    });
    res.json(transformed);
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
    
    // Debug: log full artwork object
    // Remove image_data from response and always add updatedAt (even if null)
    if (artwork) {
      if ('image_data' in artwork) delete artwork.image_data;
      artwork.updatedAt = artwork.updated_at || null;
      delete artwork.updated_at;
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
    // Validate required fields
    if (!validateString(req.body.title, 2, 255)) {
      return res.status(400).json({ error: 'Title must be between 2 and 255 characters' });
    }
    if (!validateString(req.body.category, 2, 50)) {
      return res.status(400).json({ error: 'Category must be between 2 and 50 characters' });
    }
    if (!validateString(req.body.description, 10, 5000)) {
      return res.status(400).json({ error: 'Description must be between 10 and 5000 characters' });
    }
    if (!validatePrice(req.body.price)) {
      return res.status(400).json({ error: 'Invalid price format' });
    }
    if (req.body.size && !validateString(req.body.size, 0, 100)) {
      return res.status(400).json({ error: 'Dimensions must be less than 100 characters' });
    }
    if (req.body.materials && !validateString(req.body.materials, 0, 255)) {
      return res.status(400).json({ error: 'Materials must be less than 255 characters' });
    }

    const artworkId = `art-${Date.now()}`;
    
    // Parse sizes array from request
    let sizes = [];
    if (req.body.sizes) {
      try {
        sizes = typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes;
      } catch (e) {
        sizes = [];
      }
    }
    const newArtwork = {
      id: artworkId,
      title: req.body.title.trim(),
      category: req.body.category.trim(),
      description: req.body.description.trim(),
      price: parseFloat(req.body.price),
      dimensions: req.body.size?.trim() || '',
      materials: req.body.materials?.trim() || '',
      image: req.file ? `${BASE_URL}/api/images/artworks/${artworkId}` : '',
      featured: req.body.featured === 'true',
      sizes
    };
    const artwork = await db.createArtwork(newArtwork);
    
    // Store image in database if uploaded
    if (req.file) {
      const imageBuffer = fs.readFileSync(req.file.path);
      const compressedBuffer = await compressImage(imageBuffer);
      await db.storeArtworkImage(artworkId, compressedBuffer, 'image/jpeg');
      // Delete temporary file
      fs.unlinkSync(req.file.path);
    }
    
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

    // Validate updated fields
    if (req.body.title && !validateString(req.body.title, 2, 255)) {
      return res.status(400).json({ error: 'Title must be between 2 and 255 characters' });
    }
    if (req.body.category && !validateString(req.body.category, 2, 50)) {
      return res.status(400).json({ error: 'Category must be between 2 and 50 characters' });
    }
    if (req.body.description && !validateString(req.body.description, 10, 5000)) {
      return res.status(400).json({ error: 'Description must be between 10 and 5000 characters' });
    }
    if (req.body.price && !validatePrice(req.body.price)) {
      return res.status(400).json({ error: 'Invalid price format' });
    }
    if (req.body.size && !validateString(req.body.size, 0, 100)) {
      return res.status(400).json({ error: 'Dimensions must be less than 100 characters' });
    }
    if (req.body.materials && !validateString(req.body.materials, 0, 255)) {
      return res.status(400).json({ error: 'Materials must be less than 255 characters' });
    }

    // Parse sizes array from request
    let sizes = [];
    if (req.body.sizes) {
      try {
        sizes = typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes;
      } catch (e) {
        sizes = [];
      }
    }
    const updatedArtwork = {
      title: req.body.title?.trim() || existingArtwork.title,
      category: req.body.category?.trim() || existingArtwork.category,
      description: req.body.description?.trim() || existingArtwork.description,
      price: req.body.price ? parseFloat(req.body.price) : existingArtwork.price,
      dimensions: req.body.size?.trim() || existingArtwork.dimensions,
      materials: req.body.materials?.trim() || existingArtwork.materials,
      featured: req.body.featured !== undefined ? req.body.featured === 'true' : existingArtwork.featured,
      image: existingArtwork.image,
      sizes
    };

    // Update image if new one is uploaded
    if (req.file) {
      updatedArtwork.image = `${BASE_URL}/api/images/artworks/${req.params.id}`;
      
      // Store new image in database with compression
      const imageBuffer = fs.readFileSync(req.file.path);
      const compressedBuffer = await compressImage(imageBuffer);
      await db.storeArtworkImage(req.params.id, compressedBuffer, 'image/jpeg');
      
      // Delete temporary file
      fs.unlinkSync(req.file.path);
    }

    const artwork = await db.updateArtwork(req.params.id, updatedArtwork);
    // Convert updated_at to updatedAt for frontend cache-busting
    if (artwork && artwork.updated_at) {
      artwork.updatedAt = artwork.updated_at;
      delete artwork.updated_at;
    }
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
      
      // Prevent path traversal attacks
      const sanitizedFilename = path.basename(filename);
      const imagePath = path.join(__dirname, 'uploads', sanitizedFilename);
      
      // Ensure the resolved path is within uploads directory
      const uploadsPath = path.join(__dirname, 'uploads');
      if (imagePath.startsWith(uploadsPath) && fs.existsSync(imagePath)) {
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


// Profanity filter
const Filter = require('bad-words').default || require('bad-words').Filter || require('bad-words');
const profanityFilter = new Filter();

// Send contact form message with spam prevention and profanity filter
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

    // Enhanced validation
    if (!validateString(name, 2, 100)) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!validateString(subject, 3, 200)) {
      return res.status(400).json({ error: 'Subject must be between 3 and 200 characters' });
    }
    if (!validateString(message, 20, 5000)) {
      return res.status(400).json({ error: 'Message must be between 20 and 5000 characters' });
    }

    // Profanity check
    if (profanityFilter.isProfane(name) || profanityFilter.isProfane(subject) || profanityFilter.isProfane(message)) {
      return res.status(400).json({ error: 'Inappropriate language is not allowed.' });
    }

    // Get admin emails from database
    const contactData = await db.getContact();
    const adminEmails = contactData?.emails || ['snarla369@gmail.com'];

        // Sanitize user input to prevent XSS
    const sanitizeHTML = (str) => {
      return str.replace(/[&<>"']/g, (match) => {
        const escape = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        };
        return escape[match];
      });
    };

    const mailOptions = {
      from: 'Chitrakala Arts <onboarding@resend.dev>',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8b5a3c;">New Contact Form Submission</h2>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Name:</strong> ${sanitizeHTML(name)}</p>
            <p><strong>Email:</strong> ${sanitizeHTML(email)}</p>
            <p><strong>Subject:</strong> ${sanitizeHTML(subject)}</p>
          </div>
          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${sanitizeHTML(message)}</p>
          </div>
          <div style="margin-top: 20px; padding: 10px; background-color: #f9f9f9; border-radius: 5px; font-size: 12px; color: #666;">
            <p><strong>Submission Details:</strong></p>
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
    
    // If a new developer logo was uploaded, store in database
    if (req.file) {
      settingsData.developer.logo = `${BASE_URL}/api/images/logo`;
      
      // Store logo in database with compression
      const imageBuffer = fs.readFileSync(req.file.path);
      const compressedBuffer = await compressImage(imageBuffer);
      await db.storeLogoImage(compressedBuffer, 'image/jpeg');
      
      // Delete temporary file
      fs.unlinkSync(req.file.path);
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
app.post('/api/about/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Store image in database with compression
    const imageBuffer = fs.readFileSync(req.file.path);
    const compressedBuffer = await compressImage(imageBuffer);
    await db.storeAboutImage(compressedBuffer, 'image/jpeg');
    
    // Delete temporary file
    fs.unlinkSync(req.file.path);
    
    const imageUrl = `${BASE_URL}/api/images/about`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Error uploading story image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Global error handler - must be after all routes
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
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
      console.log(`🎨 Chitrakala Arts - Complete BLOB storage active!`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
