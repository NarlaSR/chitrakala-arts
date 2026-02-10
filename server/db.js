const { Pool } = require('pg');

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Check if database is configured
const isDatabaseConfigured = () => {
  return !!process.env.DATABASE_URL;
};

// Initialize database schema
async function initializeDatabase() {
  if (!isDatabaseConfigured()) {
    console.log('⚠️  DATABASE_URL not configured - skipping database initialization');
    console.log('⚠️  Server will use JSON files for data storage');
    return;
  }

  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create artworks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS artworks (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        price DECIMAL(10, 2),
        description TEXT,
        dimensions VARCHAR(100),
        materials VARCHAR(255),
        image VARCHAR(255),
        featured BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create about table (single row)
    await client.query(`
      CREATE TABLE IF NOT EXISTS about (
        id INTEGER PRIMARY KEY DEFAULT 1,
        story_title VARCHAR(255),
        story_paragraphs TEXT[],
        story_image VARCHAR(255),
        process_title VARCHAR(255),
        process_text TEXT,
        commitment_title VARCHAR(255),
        commitment_text TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);

    // Create art_forms table
    await client.query(`
      CREATE TABLE IF NOT EXISTS art_forms (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        display_order INTEGER DEFAULT 0
      )
    `);

    // Create contact table (single row)
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact (
        id INTEGER PRIMARY KEY DEFAULT 1,
        emails TEXT[],
        phone VARCHAR(50),
        address_street VARCHAR(255),
        address_city VARCHAR(100),
        address_state VARCHAR(50),
        address_zip VARCHAR(20),
        hours_weekdays VARCHAR(100),
        hours_weekend VARCHAR(100),
        social_facebook VARCHAR(255),
        social_instagram VARCHAR(255),
        social_pinterest VARCHAR(255),
        social_twitter VARCHAR(255),
        show_hours BOOLEAN DEFAULT TRUE,
        show_address BOOLEAN DEFAULT TRUE,
        show_social BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);

    // Create settings table (single row)
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        site_name VARCHAR(255),
        tagline VARCHAR(255),
        copyright TEXT,
        social_facebook VARCHAR(255),
        social_instagram VARCHAR(255),
        social_pinterest VARCHAR(255),
        social_twitter VARCHAR(255),
        social_youtube VARCHAR(255),
        developer_name VARCHAR(255),
        developer_logo VARCHAR(255),
        developer_website VARCHAR(255),
        developer_show_credit BOOLEAN DEFAULT TRUE,
        show_social BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);

    await client.query('COMMIT');
    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initializeDatabase,
  isDatabaseConfigured
};
