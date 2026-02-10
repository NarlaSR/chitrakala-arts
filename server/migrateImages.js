const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { pool, initializeDatabase } = require('./db');
const db = require('./dbQueries');

async function migrateImages() {
  console.log('🖼️  Starting image migration to PostgreSQL...');
  
  try {
    // Ensure database is initialized
    await initializeDatabase();
    
    // Migrate artwork images
    console.log('\n📦 Migrating artwork images...');
    const artworks = await db.getArtworks();
    
    for (const artwork of artworks) {
      // Check if image already has data in database
      const imageData = await db.getArtworkImage(artwork.id);
      if (imageData && imageData.image_data) {
        console.log(`  ⏭️  Skipping ${artwork.id} - already in database`);
        continue;
      }
      
      // Find the image file in uploads directory
      const uploadsDir = path.join(__dirname, 'uploads');
      const files = fs.readdirSync(uploadsDir);
      
      // Try to find a matching image file
      let imageFile = null;
      
      // First try to match by filename if image URL contains a filename
      if (artwork.image && artwork.image.includes('/uploads/')) {
        const filename = artwork.image.split('/uploads/')[1];
        if (files.includes(filename)) {
          imageFile = path.join(uploadsDir, filename);
        }
      }
      
      // If not found, try the numbered pattern (1770419263457-804127379.jpg)
      if (!imageFile) {
        const artworkNumber = artwork.id.replace('art-', '');
        const matchingFile = files.find(f => f.startsWith(artworkNumber));
        if (matchingFile) {
          imageFile = path.join(uploadsDir, matchingFile);
        }
      }
      
      if (imageFile && fs.existsSync(imageFile)) {
        const imageBuffer = fs.readFileSync(imageFile);
        
        // Compress image before storing
        const compressedBuffer = await sharp(imageBuffer)
          .resize(1920, 1920, { 
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();
        
        await db.storeArtworkImage(artwork.id, compressedBuffer, 'image/jpeg');
        
        // Update the image URL to point to the database route
        const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
        const newImageUrl = `${BASE_URL}/api/images/artworks/${artwork.id}`;
        await pool.query('UPDATE artworks SET image = $1 WHERE id = $2', [newImageUrl, artwork.id]);
        
        console.log(`  ✅ Migrated & compressed ${artwork.id}: ${path.basename(imageFile)}`);
      } else {
        console.log(`  ⚠️  No image file found for ${artwork.id}`);
      }
    }
    
    console.log('\n✅ Image migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Total artworks: ${artworks.length}`);
    
  } catch (error) {
    console.error('❌ Error during image migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}

migrateImages();
