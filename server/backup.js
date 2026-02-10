const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function backupDatabase() {
  console.log('🔄 Starting database backup...');
  
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {}
    };

    // Backup users (without passwords for security)
    console.log('📦 Backing up users...');
    const usersResult = await pool.query('SELECT id, username, role, created_at FROM users');
    backup.data.users = usersResult.rows;

    // Backup artworks (without image data - too large)
    console.log('📦 Backing up artworks...');
    const artworksResult = await pool.query(
      'SELECT id, title, category, price, description, dimensions, materials, image, featured, created_at FROM artworks ORDER BY created_at DESC'
    );
    backup.data.artworks = artworksResult.rows;

    // Backup about page
    console.log('📦 Backing up about page...');
    const aboutResult = await pool.query('SELECT * FROM about');
    if (aboutResult.rows.length > 0) {
      const about = { ...aboutResult.rows[0] };
      delete about.story_image_data; // Remove large binary data
      backup.data.about = about;
    }

    // Backup art forms
    console.log('📦 Backing up art forms...');
    const artFormsResult = await pool.query('SELECT * FROM art_forms ORDER BY id');
    backup.data.art_forms = artFormsResult.rows;

    // Backup contact info
    console.log('📦 Backing up contact info...');
    const contactResult = await pool.query('SELECT * FROM contact');
    if (contactResult.rows.length > 0) {
      backup.data.contact = contactResult.rows[0];
    }

    // Backup settings
    console.log('📦 Backing up settings...');
    const settingsResult = await pool.query('SELECT * FROM settings');
    if (settingsResult.rows.length > 0) {
      const settings = { ...settingsResult.rows[0] };
      delete settings.logo_data; // Remove large binary data
      backup.data.settings = settings;
    }

    // Create backups directory if it doesn't exist
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir);
    }

    // Save backup to file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `backup_${timestamp}.json`;
    const filepath = path.join(backupsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

    console.log('\n✅ Backup completed successfully!');
    console.log(`📁 File: ${filename}`);
    console.log(`📍 Location: ${filepath}`);
    console.log(`\n📊 Backup Summary:`);
    console.log(`   - Users: ${backup.data.users?.length || 0}`);
    console.log(`   - Artworks: ${backup.data.artworks?.length || 0}`);
    console.log(`   - Art Forms: ${backup.data.art_forms?.length || 0}`);
    console.log(`   - About Page: ${backup.data.about ? 'Yes' : 'No'}`);
    console.log(`   - Contact Info: ${backup.data.contact ? 'Yes' : 'No'}`);
    console.log(`   - Settings: ${backup.data.settings ? 'Yes' : 'No'}`);
    console.log(`\n⚠️  Note: Image data is NOT included in backups (stored in database only)`);
    
  } catch (error) {
    console.error('❌ Error during backup:', error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

backupDatabase();
