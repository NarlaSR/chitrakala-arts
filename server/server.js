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
const { initializeDatabase, isDatabaseConfigured, pool } = require('./db');
const db = require('./dbQueries');
const { calculateUsdPrice, getPriceForCountry } = require('./priceUtils');

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

// Public website maintenance mode. The admin-controlled app_settings value
// ("maintenance_mode" key) is the primary source of truth so the site owner
// can toggle it from the admin UI with no code change or redeploy. The
// MAINTENANCE_MODE env var is only a fallback/default, used if no DB value
// has been set yet or if the DB read itself fails. Only the exact string
// "true" is ever treated as enabled.
const MAINTENANCE_MODE_ENV_DEFAULT = process.env.MAINTENANCE_MODE === 'true';

async function getMaintenanceMode() {
  try {
    const setting = await db.getAppSetting('maintenance_mode');
    if (setting) {
      return setting.value === 'true';
    }
  } catch (error) {
    console.error('Error reading maintenance_mode setting, falling back to env default:', error);
  }
  return MAINTENANCE_MODE_ENV_DEFAULT;
}

// Trust Railway proxy to get correct IP addresses for rate limiting
app.set('trust proxy', 1);

// CORS configuration - restrict to your domains
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5000',
  'https://chitrakalaarts-production.up.railway.app',
  'https://www.chitrakala-arts.com', // Add your actual domain
  'https://chitrakala-arts.vercel.app', // Add your actual Vercel frontend URL
  'https://chitrakala-arts-bkclleiho-sanjays-projects-7230cec0.vercel.app', // Added preview Vercel URL
  'https://chitrakala-arts-git-cka-6-mult-516191-sanjays-projects-7230cec0.vercel.app', // Added new preview Vercel URL
  'https://chitrakala-arts-a1o06fflo-sanjays-projects-7230cec0.vercel.app', // Added another preview Vercel URL
  'https://chitrakala-arts-git-wishlist-feature-sanjays-projects-7230cec0.vercel.app', // Added wishlist feature preview Vercel URL
  process.env.FRONTEND_URL,
  'http://localhost:3001' // Ensure local dev frontend is allowed
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Debug log for CORS
    console.log('CORS request origin:', origin);
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    // Allow all Vercel preview deployments for this project
    if (origin.endsWith('-sanjays-projects-7230cec0.vercel.app')) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

// Body parsing middleware - must be before any routes that read req.body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health/status endpoint - always accessible, including during maintenance mode
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Read-only maintenance mode status for the public frontend to poll.
// Reads the admin-controlled DB setting (falls back to env/default).
app.get('/api/config/maintenance-mode', async (req, res) => {
  const maintenanceMode = await getMaintenanceMode();
  res.json({ maintenanceMode });
});

// Deprecated alias - kept working for backward compatibility with any
// existing callers of the original endpoint name. New code should use
// /api/config/maintenance-mode above.
app.get('/api/config/maintenance', async (req, res) => {
  const maintenanceMode = await getMaintenanceMode();
  res.json({ maintenanceMode });
});

// Admin: read current maintenance mode state and who last changed it
app.get('/api/admin/settings/maintenance-mode', authenticateToken, async (req, res) => {
  try {
    const setting = await db.getAppSetting('maintenance_mode');
    res.json({
      maintenanceMode: setting ? setting.value === 'true' : MAINTENANCE_MODE_ENV_DEFAULT,
      updatedAt: setting ? setting.updated_at : null,
      updatedBy: setting ? setting.updated_by : null
    });
  } catch (error) {
    console.error('Error fetching maintenance mode setting:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance mode setting' });
  }
});

// Admin: turn maintenance mode ON/OFF. Persists to the database and takes
// effect immediately for the public site - no code change or redeploy needed.
app.patch('/api/admin/settings/maintenance-mode', authenticateToken, async (req, res) => {
  try {
    const { maintenanceMode } = req.body;
    if (typeof maintenanceMode !== 'boolean') {
      return res.status(400).json({ error: 'maintenanceMode must be a boolean' });
    }

    const updated = await db.setAppSetting(
      'maintenance_mode',
      maintenanceMode ? 'true' : 'false',
      req.user.username
    );

    res.json({
      maintenanceMode: updated.value === 'true',
      updatedAt: updated.updated_at,
      updatedBy: updated.updated_by
    });
  } catch (error) {
    console.error('Error updating maintenance mode setting:', error);
    res.status(500).json({ error: 'Failed to update maintenance mode setting' });
  }
});

// Update only artwork USD price (admin override)
app.put('/api/artworks/:id/price', authenticateToken, async (req, res) => {
  try {
    const artwork = await db.getArtworkById(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Artwork not found' });

    const { price_usd, fx_rate_used, multiplier_used } = req.body;
    if (price_usd === undefined || price_usd === null || isNaN(Number(price_usd))) {
      return res.status(400).json({ error: 'Invalid price_usd' });
    }

    const newUsd = parseFloat(price_usd);

    const updated = await db.updateArtworkPriceUsd(req.params.id, newUsd, fx_rate_used || null, multiplier_used || null);
    if (!updated) return res.status(500).json({ error: 'Failed to update artwork price' });

    // Normalize updated_at for frontend
    if (updated && updated.updated_at) {
      updated.updatedAt = updated.updated_at;
      delete updated.updated_at;
    }

    res.json({ message: 'Price updated', artwork: updated });
  } catch (error) {
    console.error('Error updating artwork price:', error);
    res.status(500).json({ error: 'Failed to update artwork price' });
  }
});

// Static file serving
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
// Lazily initialized so missing RESEND_API_KEY doesn't crash the server on startup
let resend = null;
function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Rate limiter for contact form (3 submissions per hour per IP)
const contactLimiter =
  process.env.NODE_ENV === 'production'
    ? rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3,
        message: { error: 'Too many messages sent. Please try again later.' },
        standardHeaders: true,
        legacyHeaders: false,
      })
    : (req, res, next) => next(); // Disable rate limit in development

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
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
      if (!defaultPassword) {
        throw new Error('DEFAULT_ADMIN_PASSWORD environment variable is required for admin setup.');
      }
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await db.createUser('admin-1', 'admin', hashedPassword, 'admin');
      console.log('✅ Default admin created - username: admin');
      console.warn('⚠️  IMPORTANT: Admin password is set from environment variable. Keep it secure!');
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

// ── Inventory-specific validation helpers ──────────────────────────────────

// Shared approved status set — used by both PUT and PATCH endpoints.
const ALLOWED_ARTWORK_STATUSES = new Set([
  'NEEDS_REVIEW', 'IN_STOCK', 'OUT_OF_STOCK', 'SOLD', 'ARCHIVED',
]);

// Valid new-format SKU: CKS-YYYY-(DM|LA|MM|WA|TA|MA)-(SM|MD|LG|XL)-NNNNN
// Rejects old format (CKS-DM-SM-2026-0001) and retired codes (MW).
const VALID_SKU_PATTERN = /^CKS-\d{4}-(DM|LA|MM|WA|TA|MA)-(SM|MD|LG|XL)-\d{5}$/;

const isValidInventorySku = (sku) => VALID_SKU_PATTERN.test(sku);

// Returns the integer value, null if not supplied, or { error } if invalid.
const validateQuantity = (val) => {
  if (val === undefined || val === null || val === '') return null; // not provided
  const n = Number(val);
  if (!Number.isInteger(n)) return { error: 'Quantity must be a whole number.' };
  if (n < 0) return { error: 'Quantity cannot be negative.' };
  return n; // 0 is valid (out-of-stock quantity)
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
function authenticateToken(req, res, next) {
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
}

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
    // Set CORS headers for cross-origin image requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
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
    // Set CORS headers for cross-origin image requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
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

// Get artwork by ID (public — only IN_STOCK artworks are accessible)
app.get('/api/artworks/:id', async (req, res) => {
  try {
    const artwork = await db.getArtworkById(req.params.id, true);
    if (!artwork) {
      return res.status(404).json({ error: 'Artwork not found' });
    }
    if ('image_data' in artwork) delete artwork.image_data;
    artwork.updatedAt = artwork.updated_at || null;
    delete artwork.updated_at;
    res.json(artwork);
  } catch (error) {
    console.error('Error reading artwork:', error);
    res.status(500).json({ error: 'Failed to fetch artwork' });
  }
});

// Get all artworks — admin only, returns all statuses including NEEDS_REVIEW
app.get('/api/admin/artworks', authenticateToken, async (req, res) => {
  try {
    const artworks = await db.getArtworksAdmin();
    const transformed = artworks.map(artwork => {
      if ('image_data' in artwork) delete artwork.image_data;
      artwork.updatedAt = artwork.updated_at || null;
      delete artwork.updated_at;
      return artwork;
    });
    res.json(transformed);
  } catch (error) {
    console.error('Error reading artworks (admin):', error);
    res.status(500).json({ error: 'Failed to fetch artworks' });
  }
});

// Create new artwork (admin only)
app.post('/api/artworks', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    // Debug: log incoming request body
    console.log('POST /api/artworks request body:', req.body);
    // Validate required fields
    if (!validateString(req.body.title, 2, 255)) {
      console.error('Validation failed: title');
      return res.status(400).json({ error: 'Title must be between 2 and 255 characters' });
    }
    if (!validateString(req.body.category, 2, 50)) {
      console.error('Validation failed: category');
      return res.status(400).json({ error: 'Category must be between 2 and 50 characters' });
    }
    if (!validateString(req.body.description, 10, 5000)) {
      console.error('Validation failed: description');
      return res.status(400).json({ error: 'Description must be between 10 and 5000 characters' });
    }
    if (!validatePrice(req.body.price)) {
      console.error('Validation failed: price', req.body.price);
      return res.status(400).json({ error: 'Invalid price format' });
    }
    if (req.body.size && !validateString(req.body.size, 0, 100)) {
      console.error('Validation failed: size');
      return res.status(400).json({ error: 'Dimensions must be less than 100 characters' });
    }
    if (req.body.materials && !validateString(req.body.materials, 0, 255)) {
      console.error('Validation failed: materials');
      return res.status(400).json({ error: 'Materials must be less than 255 characters' });
    }

    const artworkId = `art-${Date.now()}`;
    
    // Get current pricing settings for USD calculation
    const pricingSettings = await db.getPricingSettings();
    const fxRate = parseFloat(pricingSettings.fx_rate || 83);
    const multiplier = parseFloat(pricingSettings.usd_multiplier || 1.75);
    
    // Parse sizes array from request
    let sizes = [];
    if (req.body.sizes) {
      try {
        sizes = typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes;
      } catch (e) {
        console.error('Failed to parse sizes:', req.body.sizes);
        sizes = [];
      }
    }
    
    // Calculate INR and USD prices
    const priceInr = parseFloat(req.body.price);
    const priceUsd = calculateUsdPrice(priceInr, fxRate, multiplier);
    
    const newArtwork = {
      id: artworkId,
      title: req.body.title.trim(),
      category: req.body.category.trim(),
      description: req.body.description.trim(),
      price: priceInr, // Keep for backward compatibility
      price_inr: priceInr,
      price_usd: priceUsd,
      fx_rate_used: fxRate,
      multiplier_used: multiplier,
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
    console.error('Request body at error:', req.body);
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

    // Get current pricing settings for USD calculation
    const pricingSettings = await db.getPricingSettings();
    const fxRate = parseFloat(pricingSettings.fx_rate || 83);
    const multiplier = parseFloat(pricingSettings.usd_multiplier || 1.75);

    // Parse sizes array from request
    let sizes = [];
    if (req.body.sizes) {
      try {
        sizes = typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes;
      } catch (e) {
        sizes = [];
      }
    }
    
    // Calculate INR and USD prices if price is being updated
    let priceInr = existingArtwork.price_inr || existingArtwork.price;
    let priceUsd = existingArtwork.price_usd;
    let fxRateUsed = existingArtwork.fx_rate_used;
    let multiplierUsed = existingArtwork.multiplier_used;
    
    if (req.body.price) {
      priceInr = parseFloat(req.body.price);
      priceUsd = calculateUsdPrice(priceInr, fxRate, multiplier);
      fxRateUsed = fxRate;
      multiplierUsed = multiplier;
    }
    
    // Validate status (if provided)
    if (req.body.status && !ALLOWED_ARTWORK_STATUSES.has(req.body.status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values: ${[...ALLOWED_ARTWORK_STATUSES].join(', ')}`,
      });
    }

    // Validate SKU (if provided).
    // Blank SKU in request = explicitly clear it. Missing SKU = preserve existing.
    let finalSku = existingArtwork.sku ?? null; // default: preserve
    if (req.body.sku !== undefined) {
      const rawSku = req.body.sku?.trim() || null;
      if (rawSku) {
        if (!isValidInventorySku(rawSku)) {
          return res.status(400).json({
            error: 'Invalid SKU format. Expected CKS-YYYY-CODE-SIZE-00001 with a valid Art Work code (DM, LA, MM, WA, TA, MA) and size code (SM, MD, LG, XL).',
          });
        }
        const skuOwner = await db.getArtworkBySku(rawSku);
        if (skuOwner && skuOwner.id !== req.params.id) {
          return res.status(409).json({ error: 'SKU already exists on another artwork.' });
        }
      }
      finalSku = rawSku; // null = explicitly clear; non-null = validated value
    }

    // Validate quantity (if provided).
    // Blank/missing = preserve existing. Explicit value = validate and use.
    let finalQuantity = existingArtwork.quantity ?? null;
    if (req.body.quantity !== undefined && req.body.quantity !== '') {
      const qResult = validateQuantity(req.body.quantity);
      if (qResult && typeof qResult === 'object' && qResult.error) {
        return res.status(400).json({ error: qResult.error });
      }
      finalQuantity = qResult;
    }

    const updatedArtwork = {
      title:          req.body.title?.trim()       || existingArtwork.title,
      category:       req.body.category?.trim()    || existingArtwork.category,
      description:    req.body.description?.trim() || existingArtwork.description,
      price:          priceInr,
      price_inr:      priceInr,
      price_usd:      priceUsd,
      fx_rate_used:   fxRateUsed,
      multiplier_used: multiplierUsed,
      dimensions:     req.body.size?.trim()        || existingArtwork.dimensions,
      materials:      req.body.materials?.trim()   || existingArtwork.materials,
      featured:       req.body.featured !== undefined ? req.body.featured === 'true' : existingArtwork.featured,
      image:          existingArtwork.image,
      sizes,
      // New fields: server resolves final value (merge with existing), no DB-level COALESCE ambiguity
      status:         req.body.status || existingArtwork.status || null,
      quantity:       finalQuantity,
      sku:            finalSku,
      image_filename: req.body.image_filename !== undefined
                        ? (req.body.image_filename?.trim() || null)
                        : (existingArtwork.image_filename ?? null),
      notes:          req.body.notes !== undefined
                        ? (req.body.notes?.trim() || null)
                        : (existingArtwork.notes ?? null),
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

// PATCH /api/admin/artworks/:id/status — update artwork status only (admin only)
app.patch('/api/admin/artworks/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  if (!status || !ALLOWED_ARTWORK_STATUSES.has(status)) {
    return res.status(400).json({
      error: `Invalid or missing status. Allowed values: ${[...ALLOWED_ARTWORK_STATUSES].join(', ')}`,
    });
  }
  try {
    const artwork = await db.updateArtworkStatus(req.params.id, status);
    if (!artwork) return res.status(404).json({ error: 'Artwork not found' });
    res.json(artwork);
  } catch (err) {
    console.error('Error updating artwork status:', err);
    res.status(500).json({ error: 'Failed to update artwork status' });
  }
});

// ─── Category Routes ────────────────────────────────────────────────────────

// GET /api/categories — public
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/:id — public
app.get('/api/categories/:id', async (req, res) => {
  try {
    const category = await db.getCategoryById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST /api/categories — admin only
app.post('/api/categories', authenticateToken, async (req, res) => {
  try {
    const { id, name, description, display_order, image } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id and name are required' });
    // Validate slug format
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      return res.status(400).json({ error: 'id must be a lowercase slug (e.g. "my-category")' });
    }
    const category = await db.createCategory({ id, name, description, display_order, image });
    res.status(201).json(category);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A category with that id already exists' });
    }
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id — admin only
app.put('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const { name, description, display_order, image } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const category = await db.updateCategory(req.params.id, { name, description, display_order, image });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id — admin only
app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteCategory(req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    if (error.code === 'CATEGORY_IN_USE') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
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

// Get site settings (for footer and general site info - public)
app.get('/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
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
    const adminEmails = contactData?.emails || ['chitrakala.sanskriti@gmail.com'];

    // Determine recipient email: env > db > default
    const envEmail = process.env.INQUIRY_EMAIL;
    const fallbackEmail = process.env.INQUIRY_EMAIL_FALLBACK;
    const recipientEmail = [envEmail || adminEmails[0] || 'chitrakala.sanskriti@gmail.com'];

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

    const result = await getResend().emails.send({
      from: 'Chitrakala Arts <info@chitrakala-arts.com>',
      to: recipientEmail,
      replyTo: email,
      subject: `New Contact Form: ${subject}`,
      html: mailOptions.html
    });

    // Log the full result for debugging
    console.log('Full Resend API response:', JSON.stringify(result, null, 2));
    if (result.error) {
      console.warn('Primary email failed:', result.error);
      // Try fallback email if configured
      if (fallbackEmail) {
        const fallbackResult = await getResend().emails.send({
          from: 'Chitrakala Arts <info@chitrakala-arts.com>',
          to: [fallbackEmail],
          replyTo: email,
          subject: `New Contact Form: ${subject}`,
          html: mailOptions.html
        });
        console.log('Fallback Resend API response:', JSON.stringify(fallbackResult, null, 2));
        if (fallbackResult.error) {
          console.error('Fallback email also failed:', fallbackResult.error);
          return res.status(500).json({ error: 'Failed to send inquiry email. Please try again later. Or contact us directly at chitrakala.sanskriti@gmail.com' });
        } else {
          return res.json({ message: 'Message sent successfully to fallback email.' });
        }
      } else {
        return res.status(500).json({ error: 'Failed to send inquiry email. Please try again later. Or contact us directly at chitrakala.sanskriti@gmail.com' });
      }
    }
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

// Pricing Settings Routes (Admin only)

// Get pricing settings (admin only)
app.get('/api/pricing-settings', authenticateToken, async (req, res) => {
  try {
    const settings = await db.getPricingSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching pricing settings:', error);
    res.status(500).json({ error: 'Failed to fetch pricing settings' });
  }
});

// Update pricing settings (admin only)
app.put('/api/pricing-settings', authenticateToken, async (req, res) => {
  try {
    const { fx_rate, usd_multiplier } = req.body;
    
    // Validate input
    if (!fx_rate || !usd_multiplier) {
      return res.status(400).json({ error: 'FX rate and USD multiplier are required' });
    }
    
    const fxRateNum = parseFloat(fx_rate);
    const multiplierNum = parseFloat(usd_multiplier);
    
    if (isNaN(fxRateNum) || fxRateNum <= 0) {
      return res.status(400).json({ error: 'Invalid FX rate' });
    }
    
    if (isNaN(multiplierNum) || multiplierNum <= 0) {
      return res.status(400).json({ error: 'Invalid USD multiplier' });
    }
    
    await db.updatePricingSettings({
      fx_rate: fxRateNum.toString(),
      usd_multiplier: multiplierNum.toString()
    });
    
    res.json({ 
      message: 'Pricing settings updated successfully',
      fx_rate: fxRateNum,
      usd_multiplier: multiplierNum
    });
  } catch (error) {
    console.error('Error updating pricing settings:', error);
    res.status(500).json({ error: 'Failed to update pricing settings' });
  }
});

// Fetch latest FX rate from external API (admin only)
app.post('/api/pricing-settings/fetch-fx-rate', authenticateToken, async (req, res) => {
  try {
    // Using exchangerate-api.com (free tier available)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rate');
    }
    
    const data = await response.json();
    const usdToInrRate = data.rates.INR;
    
    if (!usdToInrRate) {
      throw new Error('INR rate not found in response');
    }
    
    // Return the rate (we store INR to USD, so we need the inverse)
    const inrToUsdRate = 1 / usdToInrRate;
    const fxRate = Math.round(usdToInrRate * 100) / 100; // Round to 2 decimals
    
    res.json({ 
      fx_rate: fxRate,
      source: 'exchangerate-api.com',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching FX rate:', error);
    res.status(500).json({ error: 'Failed to fetch latest FX rate' });
  }
});

// Recalculate USD prices for all artworks (admin only)
app.post('/api/artworks/recalculate-prices', authenticateToken, async (req, res) => {
  try {
    const settings = await db.getPricingSettings();
    const fxRate = parseFloat(settings.fx_rate);
    const multiplier = parseFloat(settings.usd_multiplier);
    
    if (!fxRate || !multiplier) {
      return res.status(400).json({ error: 'Pricing settings not configured' });
    }
    
    const artworks = await db.getArtworksAdmin();
    let updatedCount = 0;
    
    for (const artwork of artworks) {
      if (artwork.price_inr) {
        const priceUsd = calculateUsdPrice(artwork.price_inr, fxRate, multiplier);
        
        await db.updateArtwork(artwork.id, {
          ...artwork,
          price_usd: priceUsd,
          fx_rate_used: fxRate,
          multiplier_used: multiplier
        });
        
        updatedCount++;
      }
    }
    
    res.json({ 
      message: `Successfully recalculated prices for ${updatedCount} artworks`,
      count: updatedCount,
      fx_rate: fxRate,
      multiplier: multiplier
    });
  } catch (error) {
    console.error('Error recalculating prices:', error);
    res.status(500).json({ error: 'Failed to recalculate prices' });
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

// Country Detection Route (for currency display)

// Get user's country based on IP address
app.get('/api/user/location', async (req, res) => {
  try {
    // Get IP address from request - try multiple headers
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const cfConnectingIp = req.headers['cf-connecting-ip']; // Cloudflare
    
    const ip = (forwardedFor?.split(',')[0]?.trim()) || 
                realIp || 
                cfConnectingIp ||
                req.connection?.remoteAddress || 
                req.socket?.remoteAddress ||
                req.connection?.socket?.remoteAddress;
    
    console.log(`[Location Detection] Headers:`, {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'cf-connecting-ip': req.headers['cf-connecting-ip']
    });
    console.log(`[Location Detection] Resolved IP: ${ip}`);
    
    // In non-production environments, allow FORCE_COUNTRY env var to override detection
    if (process.env.FORCE_COUNTRY && process.env.NODE_ENV !== 'production') {
      console.log(`[Location Detection] FORCE_COUNTRY override: ${process.env.FORCE_COUNTRY}`);
      return res.json({
        country_code: process.env.FORCE_COUNTRY,
        country_name: 'Forced (dev override)',
        ip: ip || 'local',
        source: 'FORCE_COUNTRY'
      });
    }

    // For local/development IPs, return a default country
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      console.log('[Location Detection] Local IP detected, defaulting to US');
      return res.json({ 
        country_code: 'US',
        country_name: 'United States',
        ip: ip || 'local',
        source: 'local'
      });
    }

    // Clean IPv6 prefix if present (::ffff:xxx.xxx.xxx.xxx)
    const cleanIp = ip.replace(/^::ffff:/, '');
    console.log(`[Location Detection] Clean IP: ${cleanIp}`);
    
    // Use ip-api.com for geolocation (free tier: 45 req/min, no daily limit)
    console.log(`[Location Detection] Calling ip-api.com for IP: ${cleanIp}`);
    const apiUrl = `http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,query`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error(`[Location Detection] ip-api.com returned status: ${response.status}`);
      throw new Error(`API returned status ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[Location Detection] API Response:`, data);
    
    if (data.status === 'fail') {
      console.error('[Location Detection] ip-api.com error:', data.message);
      throw new Error(data.message || 'Location API error');
    }
    
    console.log(`[Location Detection] Detected country: ${data.countryCode} (${data.country})`);
    
    res.json({
      country_code: data.countryCode || 'IN',
      country_name: data.country || 'Unknown',
      ip: data.query || cleanIp,
      source: 'ip-api.com'
    });
  } catch (error) {
    console.error('[Location Detection] Error:', error.message);
    // Default to IN on error (primary market)
    res.json({
      country_code: 'US',
      country_name: 'United States',
      ip: 'unknown',
      source: 'fallback',
      error: error.message
    });
  }
});

// --- Inventory Sync ---
const { parseInventoryBuffer, ARTWORK_CATEGORY_MAP } = require('./inventoryParser');
const AdmZip = require('adm-zip');

// Converts an inventory SKU to a clean, lowercase database artwork ID.
function buildInventoryArtworkId(sku) {
  const s = String(sku || '').trim().toLowerCase();
  if (!s) throw new Error('Cannot build artwork id: SKU is empty');
  return s.startsWith('cks-') ? s : `cks-${s}`;
}

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Multer config accepts workbook + optional ZIP or individual image files (all in memory).
const inventoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB — ZIP with images can be large
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'file'     && ['.xlsx', '.xls'].includes(ext)) return cb(null, true);
    if (file.fieldname === 'imageZip' && ext === '.zip')                   return cb(null, true);
    if (file.fieldname === 'images'   && ALLOWED_IMAGE_EXTS.has(ext))      return cb(null, true);
    cb(new Error(`File type "${ext}" not accepted for field "${file.fieldname}"`));
  },
});

/**
 * Build a Map<lowercaseFilename, Buffer> from uploaded image files and/or a ZIP.
 * Returns { imageMap, errors } where errors are blocking issues (duplicate filenames).
 */
function buildImageMap(reqFiles) {
  const imageMap = new Map(); // key: lowercase basename, value: Buffer
  const errors   = [];

  // Direct image uploads (field: images)
  for (const f of reqFiles?.images || []) {
    const name = path.basename(f.originalname).toLowerCase().trim();
    if (!name || !ALLOWED_IMAGE_EXTS.has(path.extname(name))) continue;
    if (imageMap.has(name)) {
      errors.push(`Duplicate uploaded image filename "${name}" — match would be ambiguous. Remove one and re-upload.`);
    } else {
      imageMap.set(name, f.buffer);
    }
  }

  // ZIP upload (field: imageZip)
  for (const zipFile of reqFiles?.imageZip || []) {
    let zip;
    try { zip = new AdmZip(zipFile.buffer); } catch { continue; }
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const rawName  = entry.entryName;
      // Zip-slip protection: reject entries with path traversal or absolute paths
      if (rawName.includes('..') || rawName.startsWith('/') || rawName.startsWith('\\')) {
        errors.push(`ZIP entry "${rawName}" rejected — unsafe path.`);
        continue;
      }
      const name = path.basename(rawName).toLowerCase().trim();
      if (!name || !ALLOWED_IMAGE_EXTS.has(path.extname(name))) continue;
      if (imageMap.has(name)) {
        errors.push(`Duplicate image filename "${name}" in ZIP — match would be ambiguous. Remove one and re-upload.`);
      } else {
        imageMap.set(name, entry.getData());
      }
    }
  }

  return { imageMap, errors };
}

app.post(
  '/api/admin/inventory-sync/preview',
  authenticateToken,
  inventoryUpload.fields([
    { name: 'file',     maxCount: 1   },
    { name: 'imageZip', maxCount: 1   },
    { name: 'images',   maxCount: 200 },
  ]),
  async (req, res) => {
    try {
      const workbookFile = req.files?.file?.[0];
      if (!workbookFile) {
        return res.status(400).json({ error: 'No workbook uploaded. Field name must be "file".' });
      }

      const { rows, detectedColumns, missingColumns } =
        parseInventoryBuffer(workbookFile.buffer, workbookFile.originalname);

      // Build image map from optional uploaded images/ZIP (no writes during preview)
      const { imageMap, errors: imageMapErrors } = buildImageMap(req.files);

      // Read-only check: does artworks.sku column exist yet?
      let skuColumnExists = false;
      if (isDatabaseConfigured()) {
        try {
          const col = await pool.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = 'artworks' AND column_name = 'sku'`
          );
          skuColumnExists = col.rows.length > 0;
        } catch (_) { /* DB unavailable — treat as no SKU column */ }
      }

      const batchWarnings = [];
      if (!skuColumnExists) {
        batchWarnings.push(
          'artworks table has no sku column — CREATE/UPDATE classification is not yet available. ' +
          'Valid rows are classified as CREATE_CANDIDATE. ' +
          'See docs/inventory-sync/INV-01-preview-endpoint.md for the recommended schema migration.'
        );
      }

      // If SKU column exists, fetch matching SKUs from DB (no writes)
      const existingSkus = new Set();
      if (skuColumnExists) {
        const validSkus = rows
          .filter(r => r.sku && r.errors.length === 0)
          .map(r => r.sku);
        if (validSkus.length > 0) {
          const found = await pool.query(
            'SELECT sku FROM artworks WHERE sku = ANY($1)',
            [validSkus]
          );
          found.rows.forEach(r => existingSkus.add(r.sku));
        }
      }

      // Block preview if duplicate image filenames make matching ambiguous
      if (imageMapErrors.length > 0) {
        return res.status(400).json({ error: imageMapErrors.join('; ') });
      }

      // Classify each row and compute image status
      const referencedImageNames = new Set();
      const classifiedRows = rows.map(row => {
        let classification;
        if (row.errors.length > 0) {
          classification = 'ERROR';
        } else if (!skuColumnExists) {
          classification = row.warnings.length > 0 ? 'REVIEW' : 'CREATE_CANDIDATE';
        } else if (existingSkus.has(row.sku)) {
          classification = row.warnings.length > 0 ? 'REVIEW' : 'UPDATE';
        } else {
          classification = row.warnings.length > 0 ? 'REVIEW' : 'CREATE';
        }
        // Image match status per row
        let imageStatus = 'not_provided';
        if (row.imageFilename) {
          const key = row.imageFilename.toLowerCase();
          if (imageMap.has(key)) {
            imageStatus = 'matched';
            referencedImageNames.add(key);
          } else {
            imageStatus = 'missing';
          }
        }
        return { ...row, classification, imageStatus };
      });

      // Find uploaded images not referenced by any workbook row
      const unreferencedImages = [...imageMap.keys()].filter(k => !referencedImageNames.has(k));
      if (unreferencedImages.length > 0) {
        batchWarnings.push(
          `${unreferencedImages.length} uploaded image(s) not referenced by any workbook row: ${unreferencedImages.join(', ')}`
        );
      }

      const summary = {
        totalRows:   classifiedRows.length,
        createCount: classifiedRows.filter(
          r => r.classification === 'CREATE' || r.classification === 'CREATE_CANDIDATE'
        ).length,
        updateCount: classifiedRows.filter(r => r.classification === 'UPDATE').length,
        reviewCount: classifiedRows.filter(r => r.classification === 'REVIEW').length,
        errorCount:  classifiedRows.filter(r => r.classification === 'ERROR').length,
      };

      const imageSummary = {
        rowsWithImageFilename: classifiedRows.filter(r => r.imageFilename).length,
        matched:               classifiedRows.filter(r => r.imageStatus === 'matched').length,
        missing:               classifiedRows.filter(r => r.imageStatus === 'missing').length,
        notProvided:           classifiedRows.filter(r => r.imageStatus === 'not_provided').length,
        unreferencedUploaded:  unreferencedImages.length,
      };

      return res.json({
        summary,
        imageSummary,
        rows: classifiedRows,
        warnings: batchWarnings,
        detectedColumns,
        missingColumns,
      });
    } catch (err) {
      console.error('Inventory preview error:', err);
      return res.status(500).json({ error: 'Failed to process inventory file' });
    }
  }
);

// --- Inventory Sync: apply/import (local dev only — no production use) ---
app.post(
  '/api/admin/inventory-sync/apply',
  authenticateToken,
  inventoryUpload.fields([
    { name: 'file',     maxCount: 1   },
    { name: 'imageZip', maxCount: 1   },
    { name: 'images',   maxCount: 200 },
  ]),
  async (req, res) => {
    const workbookFile = req.files?.file?.[0];
    if (!workbookFile) {
      return res.status(400).json({ error: 'No workbook uploaded. Field name must be "file".' });
    }

    // Build image map from optional image uploads — block on duplicate filenames
    const { imageMap, errors: imageMapErrors } = buildImageMap(req.files);
    if (imageMapErrors.length > 0) {
      return res.status(400).json({ error: imageMapErrors.join('; ') });
    }

    // 1. Parse workbook — always revalidate server-side
    const { rows } = parseInventoryBuffer(workbookFile.buffer, workbookFile.originalname);

    // 2. Apply-level validation: unknown Art Work codes block import
    //    (preview warns; apply errors because category is NOT NULL in DB)
    for (const row of rows) {
      if (row.artWorkCode && !ARTWORK_CATEGORY_MAP[row.artWorkCode] && !row.errors.length) {
        row.errors.push(
          `Unknown Art Work code "${row.artWorkCode}" — no category mapping exists and category is required for import. ` +
          `Known codes: ${Object.keys(ARTWORK_CATEGORY_MAP).join(', ')}.`
        );
      }
    }

    // 3a. Catch duplicate SKUs within the batch (e.g. explicit + auto-generated collision)
    const batchSkuMap = new Map(); // sku → first rowNumber that claimed it
    for (const row of rows) {
      if (row.sku && row.errors.length === 0) {
        if (batchSkuMap.has(row.sku)) {
          row.errors.push(
            `Duplicate SKU "${row.sku}" in this upload — first seen on row ${batchSkuMap.get(row.sku)}. ` +
            'Each SKU must be unique within the batch.'
          );
        } else {
          batchSkuMap.set(row.sku, row.rowNumber);
        }
      }
    }

    // 3b. Block entire batch if any row has errors
    const errorRows = rows.filter(r => r.errors.length > 0);
    if (errorRows.length > 0) {
      return res.status(422).json({
        error: 'Batch blocked — fix all errors before applying.',
        summary: {
          totalRows: rows.length,
          createdCount: 0,
          updatedCount: 0,
          skippedCount: 0,
          errorCount: errorRows.length,
        },
        errorRows: errorRows.map(r => ({ rowNumber: r.rowNumber, errors: r.errors })),
      });
    }

    // 4. Fetch pricing settings once for this batch
    let fxRate, multiplier;
    try {
      const settings = await db.getPricingSettings();
      fxRate     = parseFloat(settings.fx_rate       || 83);
      multiplier = parseFloat(settings.usd_multiplier || 1.75);
    } catch (err) {
      return res.status(500).json({ error: 'Cannot read pricing settings — DB may be unavailable.' });
    }

    // 5. Look up which SKUs already exist in the DB (read-only)
    const candidateSkus = rows.map(r => r.sku).filter(Boolean);
    let existingSkuSet = new Set();
    if (candidateSkus.length > 0) {
      const found = await pool.query('SELECT sku FROM artworks WHERE sku = ANY($1)', [candidateSkus]);
      found.rows.forEach(r => existingSkuSet.add(r.sku));
    }

    // 6. Classify and prepare each row
    const toCreate = [];
    const toUpdate = [];
    for (const row of rows) {
      const category = ARTWORK_CATEGORY_MAP[row.artWorkCode];
      const priceUsd = calculateUsdPrice(row.priceInr, fxRate, multiplier);
      const artworkId = buildInventoryArtworkId(row.sku);

      const payload = {
        id:             artworkId,
        title:          row.itemDescription,
        category,
        priceInr:       row.priceInr,
        priceUsd,
        fxRateUsed:     fxRate,
        multiplierUsed: multiplier,
        description:    row.longDescription   || null,
        dimensions:     row.dimensions        || null,
        materials:      row.materials         || null,
        imageFilename:  row.imageFilename     || null,
        notes:          row.notes             || null,
        sku:            row.sku,
        quantity:       row.quantity,
      };

      if (existingSkuSet.has(row.sku)) {
        toUpdate.push({ rowNumber: row.rowNumber, payload });
      } else {
        toCreate.push({ rowNumber: row.rowNumber, payload });
      }
    }

    // 7. Single transaction — all-or-nothing for row data
    const client = await pool.connect();
    const created = [];
    const updated = [];
    try {
      await client.query('BEGIN');

      for (const { rowNumber, payload } of toCreate) {
        const inserted = await db.createArtworkFromInventory(payload, client);
        created.push({ rowNumber, sku: inserted.sku, artworkId: inserted.id, title: inserted.title });
      }

      for (const { rowNumber, payload } of toUpdate) {
        const patched = await db.updateArtworkFromInventory(payload.sku, payload, client);
        updated.push({ rowNumber, sku: patched.sku, artworkId: patched.id, title: patched.title });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Inventory apply error — rolled back:', err);
      return res.status(500).json({ error: 'Import failed — transaction rolled back. No data was changed.' });
    } finally {
      client.release();
    }

    // 8. Process matched images (outside the row-data transaction — images are best-effort).
    //    Row data has already been committed. Image failures are reported clearly
    //    but do NOT roll back artwork rows — the row is visible in NEEDS_REVIEW
    //    and the admin can upload the image manually via the Review Queue.
    const allProcessed = [...created, ...updated];
    const imageResults = {
      stored:  0,
      skipped: 0,   // no image filename / no matching upload — expected, not an error
      failed:  [],  // tried to store but threw — reported in response
    };
    for (const { artworkId, sku } of allProcessed) {
      const row = rows.find(r => r.sku === sku && r.imageFilename);
      if (!row?.imageFilename) { imageResults.skipped++; continue; }
      const imageKey = row.imageFilename.toLowerCase();
      if (!imageMap.has(imageKey)) { imageResults.skipped++; continue; }
      try {
        const rawBuffer        = imageMap.get(imageKey);
        const compressedBuffer = await compressImage(rawBuffer);
        await db.storeArtworkImage(artworkId, compressedBuffer, 'image/jpeg');
        await pool.query(
          'UPDATE artworks SET image = $1 WHERE id = $2',
          [`${BASE_URL}/api/images/artworks/${artworkId}`, artworkId]
        );
        imageResults.stored++;
      } catch (imgErr) {
        const msg = imgErr.message || 'Unknown error';
        console.error(`Image store failed for ${artworkId} (sku: ${sku}):`, msg);
        imageResults.failed.push({ artworkId, sku, imageFilename: row.imageFilename, error: msg });
      }
    }

    return res.json({
      summary: {
        totalRows:     rows.length,
        createdCount:  created.length,
        updatedCount:  updated.length,
        skippedCount:  0,
        errorCount:    0,
        imagesStored:  imageResults.stored,
        imagesFailed:  imageResults.failed.length,
      },
      created,
      updated,
      skipped: [],
      errors:  [],
      // Clearly report any image storage failures so the admin knows
      // which artworks need their image uploaded manually via Review Queue.
      imageFailures: imageResults.failed.length > 0 ? imageResults.failed : undefined,
    });
  }
);

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
