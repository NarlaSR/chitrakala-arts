require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration(migrationFile) {
  console.log(`\n🔍 Database: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`📄 Running migration: ${migrationFile}\n`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
  });

  const client = await pool.connect();

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'dbMigration', migrationFile);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute migration
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('✅ Migration completed successfully!');

    // Show pricing settings
    const result = await client.query('SELECT * FROM pricing_settings');
    console.log('\n📊 Current pricing settings:');
    console.table(result.rows);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2] || 'migrate_add_currency_pricing.sql';
runMigration(migrationFile).catch(err => {
  console.error(err);
  process.exit(1);
});
