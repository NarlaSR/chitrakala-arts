const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

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
