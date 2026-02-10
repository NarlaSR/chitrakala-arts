const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

// Read JSON files
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf8'));
const artworksData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'artworks.json'), 'utf8'));
const aboutData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'about.json'), 'utf8'));
const contactData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'contact.json'), 'utf8'));
const settingsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'settings.json'), 'utf8'));

async function migrateData() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Migrate users
    console.log('Migrating users...');
    for (const user of usersData) {
      await client.query(
        'INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [user.id, user.username, user.password, user.role]
      );
    }

    // Migrate artworks
    console.log('Migrating artworks...');
    for (const artwork of artworksData) {
      await client.query(
        `INSERT INTO artworks (id, title, category, price, description, dimensions, materials, image, featured) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         ON CONFLICT (id) DO NOTHING`,
        [
          artwork.id,
          artwork.title,
          artwork.category,
          artwork.price || null,
          artwork.description || null,
          artwork.size || artwork.dimensions || null,
          artwork.materials || null,
          artwork.image || null,
          artwork.featured || false
        ]
      );
    }

    // Migrate about page
    console.log('Migrating about page...');
    await client.query(
      `INSERT INTO about (id, story_title, story_paragraphs, story_image, process_title, process_text, commitment_title, commitment_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         story_title = $2,
         story_paragraphs = $3,
         story_image = $4,
         process_title = $5,
         process_text = $6,
         commitment_title = $7,
         commitment_text = $8,
         updated_at = CURRENT_TIMESTAMP`,
      [
        1,
        aboutData.story?.title || 'Our Story',
        aboutData.story?.paragraphs || [],
        aboutData.story?.image || '',
        aboutData.process?.title || 'Our Process',
        aboutData.process?.text || '',
        aboutData.commitment?.title || 'Our Commitment',
        aboutData.commitment?.text || ''
      ]
    );

    // Migrate art forms
    console.log('Migrating art forms...');
    if (aboutData.artForms && Array.isArray(aboutData.artForms)) {
      for (let i = 0; i < aboutData.artForms.length; i++) {
        const form = aboutData.artForms[i];
        await client.query(
          `INSERT INTO art_forms (id, title, description, display_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             title = $2,
             description = $3,
             display_order = $4`,
          [form.id, form.title, form.description || '', i]
        );
      }
    }

    // Migrate contact info
    console.log('Migrating contact info...');
    await client.query(
      `INSERT INTO contact (id, emails, phone, address_street, address_city, address_state, address_zip,
        hours_weekdays, hours_weekend, social_facebook, social_instagram, social_pinterest, social_twitter,
        show_hours, show_address, show_social)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         emails = $2, phone = $3, address_street = $4, address_city = $5, address_state = $6, address_zip = $7,
         hours_weekdays = $8, hours_weekend = $9, social_facebook = $10, social_instagram = $11,
         social_pinterest = $12, social_twitter = $13, show_hours = $14, show_address = $15, show_social = $16,
         updated_at = CURRENT_TIMESTAMP`,
      [
        1,
        contactData.emails || [],
        contactData.phone || '',
        contactData.address?.street || '',
        contactData.address?.city || '',
        contactData.address?.state || '',
        contactData.address?.zip || '',
        contactData.hours?.weekdays || '',
        contactData.hours?.weekend || '',
        contactData.social?.facebook || '',
        contactData.social?.instagram || '',
        contactData.social?.pinterest || '',
        contactData.social?.twitter || '',
        contactData.showHours !== false,
        contactData.showAddress !== false,
        contactData.showSocial || false
      ]
    );

    // Migrate settings
    console.log('Migrating settings...');
    await client.query(
      `INSERT INTO settings (id, site_name, tagline, copyright, social_facebook, social_instagram,
        social_pinterest, social_twitter, social_youtube, developer_name, developer_logo, developer_website,
        developer_show_credit, show_social)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         site_name = $2, tagline = $3, copyright = $4, social_facebook = $5, social_instagram = $6,
         social_pinterest = $7, social_twitter = $8, social_youtube = $9, developer_name = $10,
         developer_logo = $11, developer_website = $12, developer_show_credit = $13, show_social = $14,
         updated_at = CURRENT_TIMESTAMP`,
      [
        1,
        settingsData.siteName || 'Chitrakala Arts',
        settingsData.tagline || '',
        settingsData.copyright || '',
        settingsData.social?.facebook || '',
        settingsData.social?.instagram || '',
        settingsData.social?.pinterest || '',
        settingsData.social?.twitter || '',
        settingsData.social?.youtube || '',
        settingsData.developer?.name || '',
        settingsData.developer?.logo || '',
        settingsData.developer?.website || '',
        settingsData.developer?.showCredit !== false,
        settingsData.showSocial !== false
      ]
    );

    await client.query('COMMIT');
    console.log('✅ Data migration completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrateData()
  .then(() => {
    console.log('Migration finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
