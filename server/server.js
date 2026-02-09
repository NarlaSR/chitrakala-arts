const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

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

// Database file paths
const DATA_DIR = path.join(__dirname, 'data');
const ARTWORKS_FILE = path.join(DATA_DIR, 'artworks.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ABOUT_FILE = path.join(DATA_DIR, 'about.json');
const CONTACT_FILE = path.join(DATA_DIR, 'contact.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize default admin user
const initializeDefaultAdmin = async () => {
  // Force reset if RESET_ADMIN environment variable is set
  if (process.env.RESET_ADMIN === 'true' && fs.existsSync(USERS_FILE)) {
    fs.unlinkSync(USERS_FILE);
    console.log('Users file deleted - resetting admin password');
  }
  
  if (!fs.existsSync(USERS_FILE)) {
    const defaultAdmin = {
      id: 'admin-1',
      username: 'admin',
      password: await bcrypt.hash('sonu@786', 10),
      role: 'admin'
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
    console.log('Default admin created - username: admin');
  }
};

// Initialize default artworks
const initializeDefaultArtworks = () => {
  if (!fs.existsSync(ARTWORKS_FILE)) {
    const defaultArtworks = [];
    fs.writeFileSync(ARTWORKS_FILE, JSON.stringify(defaultArtworks, null, 2));
  }
};

// Helper functions to read/write data
const readArtworks = () => {
  if (!fs.existsSync(ARTWORKS_FILE)) return [];
  const data = fs.readFileSync(ARTWORKS_FILE, 'utf8');
  return JSON.parse(data);
};

const writeArtworks = (artworks) => {
  fs.writeFileSync(ARTWORKS_FILE, JSON.stringify(artworks, null, 2));
};

const readUsers = () => {
  if (!fs.existsSync(USERS_FILE)) return [];
  const data = fs.readFileSync(USERS_FILE, 'utf8');
  return JSON.parse(data);
};

const readAbout = () => {
  if (!fs.existsSync(ABOUT_FILE)) return null;
  const data = fs.readFileSync(ABOUT_FILE, 'utf8');
  return JSON.parse(data);
};

const writeAbout = (aboutData) => {
  fs.writeFileSync(ABOUT_FILE, JSON.stringify(aboutData, null, 2));
};

const readContact = () => {
  if (!fs.existsSync(CONTACT_FILE)) return null;
  const data = fs.readFileSync(CONTACT_FILE, 'utf8');
  return JSON.parse(data);
};

const writeContact = (contactData) => {
  fs.writeFileSync(CONTACT_FILE, JSON.stringify(contactData, null, 2));
};

// Configure nodemailer with explicit SMTP settings for better Railway compatibility
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Use STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000
});

// Rate limiter for contact form (3 submissions per hour per IP)
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many messages sent. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

    const users = readUsers();
    const user = users.find(u => u.username === username);

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
app.get('/api/artworks', (req, res) => {
  try {
    const artworks = readArtworks();
    res.json(artworks);
  } catch (error) {
    console.error('Error reading artworks:', error);
    res.status(500).json({ error: 'Failed to fetch artworks' });
  }
});

// Get artwork by ID (public)
app.get('/api/artworks/:id', (req, res) => {
  try {
    const artworks = readArtworks();
    const artwork = artworks.find(a => a.id === req.params.id);
    
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
app.post('/api/artworks', authenticateToken, upload.single('image'), (req, res) => {
  try {
    const artworks = readArtworks();
    
    const newArtwork = {
      id: `art-${Date.now()}`,
      title: req.body.title,
      category: req.body.category,
      description: req.body.description,
      price: parseFloat(req.body.price),
      size: req.body.size,
      materials: req.body.materials,
      image: req.file ? `${BASE_URL}/uploads/${req.file.filename}` : '',
      featured: req.body.featured === 'true',
      createdAt: new Date().toISOString()
    };

    artworks.push(newArtwork);
    writeArtworks(artworks);

    res.status(201).json(newArtwork);
  } catch (error) {
    console.error('Error creating artwork:', error);
    res.status(500).json({ error: 'Failed to create artwork' });
  }
});

// Update artwork (admin only)
app.put('/api/artworks/:id', authenticateToken, upload.single('image'), (req, res) => {
  try {
    const artworks = readArtworks();
    const index = artworks.findIndex(a => a.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    const updatedArtwork = {
      ...artworks[index],
      title: req.body.title || artworks[index].title,
      category: req.body.category || artworks[index].category,
      description: req.body.description || artworks[index].description,
      price: req.body.price ? parseFloat(req.body.price) : artworks[index].price,
      size: req.body.size || artworks[index].size,
      materials: req.body.materials || artworks[index].materials,
      featured: req.body.featured !== undefined ? req.body.featured === 'true' : artworks[index].featured,
      updatedAt: new Date().toISOString()
    };

    // Update image if new one is uploaded
    if (req.file) {
      // Delete old image if exists
      if (artworks[index].image) {
        // Extract filename from full URL or relative path
        const imageUrl = artworks[index].image;
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

    artworks[index] = updatedArtwork;
    writeArtworks(artworks);

    res.json(updatedArtwork);
  } catch (error) {
    console.error('Error updating artwork:', error);
    res.status(500).json({ error: 'Failed to update artwork' });
  }
});

// Delete artwork (admin only)
app.delete('/api/artworks/:id', authenticateToken, (req, res) => {
  try {
    const artworks = readArtworks();
    const index = artworks.findIndex(a => a.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Artwork not found' });
    }

    // Delete associated image file
    if (artworks[index].image) {
      // Extract filename from full URL or relative path
      const imageUrl = artworks[index].image;
      const filename = imageUrl.includes('/uploads/') 
        ? imageUrl.split('/uploads/')[1] 
        : imageUrl.replace('/uploads/', '');
      const imagePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    artworks.splice(index, 1);
    writeArtworks(artworks);

    res.json({ message: 'Artwork deleted successfully' });
  } catch (error) {
    console.error('Error deleting artwork:', error);
    res.status(500).json({ error: 'Failed to delete artwork' });
  }
});

// Contact Page Routes

// Get contact info (public)
app.get('/api/contact', (req, res) => {
  try {
    const contact = readContact();
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
app.put('/api/contact', authenticateToken, (req, res) => {
  try {
    const contactData = req.body;
    writeContact(contactData);
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
    // 1. Honeypot field should be empty (hidden field only bots fill)
    if (honeypot) {
      return res.status(400).json({ error: 'Spam detected' });
    }

    // 2. Check if form was filled too quickly (less than 3 seconds = likely bot)
    const submissionTime = Date.now();
    if (timestamp && (submissionTime - timestamp < 3000)) {
      return res.status(400).json({ error: 'Form submitted too quickly' });
    }

    // 3. Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // 4. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // 5. Message minimum length (prevent spam like "hi", "test")
    if (message.trim().length < 20) {
      return res.status(400).json({ error: 'Message must be at least 20 characters long' });
    }

    // Get admin emails from contact data
    const contactData = readContact();
    const adminEmails = contactData?.emails || ['snarla369@gmail.com'];

    // Prepare email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmails.join(', '),
      replyTo: email,
      subject: `New Contact Form: ${subject}`,
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

    // Send email
    await transporter.sendMail(mailOptions);

    res.json({ message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
});

// About Page Routes

// Get about page content (public)
app.get('/api/about', (req, res) => {
  try {
    const about = readAbout();
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
app.put('/api/about', authenticateToken, (req, res) => {
  try {
    const aboutData = req.body;
    writeAbout(aboutData);
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

// Initialize data and start server
const startServer = async () => {
  await initializeDefaultAdmin();
  initializeDefaultArtworks();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Uploads available at http://localhost:${PORT}/uploads`);
  });
};

startServer();
