const path = require('path');

module.exports = {
  // Database file location
  dbPath: path.join(__dirname, '..', 'db.json'),
  
  // Default admin credentials
  defaultAdmin: {
    username: 'admin',
    password: 'admin123'
  },
  
  // Upload settings
  uploads: {
    directory: path.join(__dirname, '..', 'public', 'uploads'),
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  }
};