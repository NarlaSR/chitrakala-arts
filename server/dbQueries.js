const { pool }  = require('./db');

// User functions
async function getUsers() {
  const result = await pool.query('SELECT * FROM users');
  return result.rows;
}

async function getUserByUsername(username) {
  const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  return result.rows[0];
}

async function createUser(id, username, password, role) {
  await pool.query(
    'INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4)',
    [id, username, password, role]
  );
}

// Artwork functions
async function getArtworks() {
  const result = await pool.query('SELECT * FROM artworks ORDER BY created_at DESC');
  return result.rows;
}

async function getArtworkById(id) {
  const result = await pool.query('SELECT * FROM artworks WHERE id = $1', [id]);
  return result.rows[0];
}

async function createArtwork(artwork) {
  const result = await pool.query(
    `INSERT INTO artworks (id, title, category, price, description, dimensions, materials, image, featured)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [artwork.id, artwork.title, artwork.category, artwork.price, artwork.description, 
     artwork.dimensions, artwork.materials, artwork.image, artwork.featured]
  );
  return result.rows[0];
}

async function updateArtwork(id, artwork) {
  const result = await pool.query(
    `UPDATE artworks 
     SET title = $2, category = $3, price = $4, description = $5, 
         dimensions = $6, materials = $7, image = $8, featured = $9,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, artwork.title, artwork.category, artwork.price, artwork.description,
     artwork.dimensions, artwork.materials, artwork.image, artwork.featured]
  );
  return result.rows[0];
}

async function deleteArtwork(id) {
  await pool.query('DELETE FROM artworks WHERE id = $1', [id]);
}

// About page functions
async function getAbout() {
  const aboutResult = await pool.query('SELECT * FROM about WHERE id = 1');
  const artFormsResult = await pool.query('SELECT * FROM art_forms ORDER BY display_order');
  
  if (aboutResult.rows.length === 0) return null;
  
  const about = aboutResult.rows[0];
  return {
    story: {
      title: about.story_title,
      paragraphs: about.story_paragraphs,
      image: about.story_image
    },
    artForms: artFormsResult.rows.map(form => ({
      id: form.id,
      title: form.title,
      description: form.description
    })),
    process: {
      title: about.process_title,
      text: about.process_text
    },
    commitment: {
      title: about.commitment_title,
      text: about.commitment_text
    }
  };
}

async function updateAbout(aboutData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update about table
    await client.query(
      `INSERT INTO about (id, story_title, story_paragraphs, story_image, process_title, process_text, commitment_title, commitment_text)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         story_title = $1, story_paragraphs = $2, story_image = $3,
         process_title = $4, process_text = $5,
         commitment_title = $6, commitment_text = $7,
         updated_at = CURRENT_TIMESTAMP`,
      [
        aboutData.story?.title,
        aboutData.story?.paragraphs || [],
        aboutData.story?.image || '',
        aboutData.process?.title,
        aboutData.process?.text,
        aboutData.commitment?.title,
        aboutData.commitment?.text
      ]
    );
    
    // Update art forms
    if (aboutData.artForms && Array.isArray(aboutData.artForms)) {
      for (let i = 0; i < aboutData.artForms.length; i++) {
        const form = aboutData.artForms[i];
        await client.query(
          `INSERT INTO art_forms (id, title, description, display_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET
             title = $2, description = $3, display_order = $4`,
          [form.id, form.title, form.description || '', i]
        );
      }
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Contact functions
async function getContact() {
  const result = await pool.query('SELECT * FROM contact WHERE id = 1');
  if (result.rows.length === 0) return null;
  
  const contact = result.rows[0];
  return {
    emails: contact.emails,
    phone: contact.phone,
    address: {
      street: contact.address_street,
      city: contact.address_city,
      state: contact.address_state,
      zip: contact.address_zip
    },
    hours: {
      weekdays: contact.hours_weekdays,
      weekend: contact.hours_weekend
    },
    social: {
      facebook: contact.social_facebook,
      instagram: contact.social_instagram,
      pinterest: contact.social_pinterest,
      twitter: contact.social_twitter
    },
    showHours: contact.show_hours,
    showAddress: contact.show_address,
    showSocial: contact.show_social
  };
}

async function updateContact(contactData) {
  await pool.query(
    `INSERT INTO contact (id, emails, phone, address_street, address_city, address_state, address_zip,
      hours_weekdays, hours_weekend, social_facebook, social_instagram, social_pinterest, social_twitter,
      show_hours, show_address, show_social)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO UPDATE SET
       emails = $1, phone = $2, address_street = $3, address_city = $4, address_state = $5, address_zip = $6,
       hours_weekdays = $7, hours_weekend = $8, social_facebook = $9, social_instagram = $10,
       social_pinterest = $11, social_twitter = $12, show_hours = $13, show_address = $14, show_social = $15,
       updated_at = CURRENT_TIMESTAMP`,
    [
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
}

// Settings functions
async function getSettings() {
  const result = await pool.query('SELECT * FROM settings WHERE id = 1');
  if (result.rows.length === 0) return null;
  
  const settings = result.rows[0];
  return {
    siteName: settings.site_name,
    tagline: settings.tagline,
    copyright: settings.copyright,
    social: {
      facebook: settings.social_facebook,
      instagram: settings.social_instagram,
      pinterest: settings.social_pinterest,
      twitter: settings.social_twitter,
      youtube: settings.social_youtube
    },
    developer: {
      name: settings.developer_name,
      logo: settings.developer_logo,
      website: settings.developer_website,
      showCredit: settings.developer_show_credit
    },
    showSocial: settings.show_social
  };
}

async function updateSettings(settingsData) {
  await pool.query(
    `INSERT INTO settings (id, site_name, tagline, copyright, social_facebook, social_instagram,
      social_pinterest, social_twitter, social_youtube, developer_name, developer_logo, developer_website,
      developer_show_credit, show_social)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       site_name = $1, tagline = $2, copyright = $3, social_facebook = $4, social_instagram = $5,
       social_pinterest = $6, social_twitter = $7, social_youtube = $8, developer_name = $9,
       developer_logo = $10, developer_website = $11, developer_show_credit = $12, show_social = $13,
       updated_at = CURRENT_TIMESTAMP`,
    [
      settingsData.siteName || '',
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
}

// Image data functions
async function storeArtworkImage(artworkId, imageBuffer, mimeType) {
  await pool.query(
    'UPDATE artworks SET image_data = $2, image_mime_type = $3 WHERE id = $1',
    [artworkId, imageBuffer, mimeType]
  );
}

async function getArtworkImage(artworkId) {
  const result = await pool.query(
    'SELECT image_data, image_mime_type FROM artworks WHERE id = $1',
    [artworkId]
  );
  return result.rows[0];
}

async function storeAboutImage(imageBuffer, mimeType) {
  await pool.query(
    'UPDATE about SET story_image_data = $1, story_image_mime_type = $2 WHERE id = 1',
    [imageBuffer, mimeType]
  );
}

async function getAboutImage() {
  const result = await pool.query(
    'SELECT story_image_data, story_image_mime_type FROM about WHERE id = 1'
  );
  return result.rows[0];
}

async function storeLogoImage(imageBuffer, mimeType) {
  await pool.query(
    'UPDATE settings SET logo_data = $1, logo_mime_type = $2 WHERE id = 1',
    [imageBuffer, mimeType]
  );
}

async function getLogoImage() {
  const result = await pool.query(
    'SELECT logo_data, logo_mime_type FROM settings WHERE id = 1'
  );
  return result.rows[0];
}

module.exports = {
  getUsers,
  getUserByUsername,
  createUser,
  getArtworks,
  getArtworkById,
  createArtwork,
  updateArtwork,
  deleteArtwork,
  getAbout,
  updateAbout,
  getContact,
  updateContact,
  getSettings,
  updateSettings,
  storeArtworkImage,
  getArtworkImage,
  storeAboutImage,
  getAboutImage,
  storeLogoImage,
  getLogoImage
};
