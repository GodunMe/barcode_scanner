#!/usr/bin/env node
/**
 * Reset admin password for MongoDB
 * 
 * Usage:
 *   MONGODB_URI=mongodb://... node scripts/reset-admin-mongo.js <newPassword> [username]
 * 
 * Example:
 *   node scripts/reset-admin-mongo.js "MyNewPassword123"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spm_barcode';

async function resetPassword() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error('Usage: node reset-admin-mongo.js <newPassword> [username]');
    console.error('Example: node reset-admin-mongo.js "MyPassword123"');
    process.exit(1);
  }

  const newPassword = argv[0];
  const username = (argv[1] || 'admin').toLowerCase();

  if (newPassword.length < 6) {
    console.error('❌ Password must be at least 6 characters');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const user = await User.findOneAndUpdate(
      { username },
      { passwordHash },
      { new: true }
    );

    if (user) {
      console.log(`✅ Password updated for user: ${user.username}`);
    } else {
      console.log(`⚠️  User not found. Creating new user: ${username}`);
      const newUser = new User({ username, passwordHash });
      await newUser.save();
      console.log(`✅ User created: ${newUser.username}`);
    }

    console.log('\nYou can now log in with:');
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${newPassword}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

resetPassword();
