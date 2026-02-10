const bcrypt = require('bcryptjs');
const { pool, initializeDatabase } = require('./db');

async function updateAdminCredentials() {
  console.log('🔐 Updating admin credentials...');
  
  try {
    await initializeDatabase();
    
    const newUsername = 'MSuchitra';
    const newPassword = 'sonu@786';
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update the admin user
    await pool.query(
      'UPDATE users SET username = $1, password = $2 WHERE role = $3',
      [newUsername, hashedPassword, 'admin']
    );
    
    console.log('✅ Admin credentials updated successfully!');
    console.log(`   Username: ${newUsername}`);
    console.log(`   Password: ${newPassword}`);
    console.log('\n⚠️  Please save these credentials in a secure location!');
    
  } catch (error) {
    console.error('❌ Error updating admin credentials:', error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

updateAdminCredentials();
