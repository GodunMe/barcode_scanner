#!/usr/bin/env node
/**
 * Initialize MongoDB collections and create default admin user
 * 
 * Usage:
 *   MONGODB_URI=mongodb://... node scripts/init-db.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Product = require('../models/Product');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spm_barcode';

async function initDB() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Create collections with indexes
    console.log('📋 Creating collections...');

    // Product collection with indexes
    await Product.collection.createIndex({ barcode: 1 }, { unique: true });
    console.log('✅ Product collection created (with barcode index)');

    // User collection with indexes
    await User.collection.createIndex({ username: 1 }, { unique: true });
    console.log('✅ User collection created (with username index)');

    // Check if admin user exists
    console.log('\n👤 Setting up admin user...');
    const adminExists = await User.findOne({ username: 'admin' });

    if (adminExists) {
      console.log('✅ Admin user already exists');
    } else {
      const defaultPassword = 'admin123';
      const passwordHash = await bcrypt.hash(defaultPassword, 10);
      const admin = new User({
        username: 'admin',
        passwordHash
      });
      await admin.save();
      console.log('✅ Admin user created');
      console.log(`\n   Username: admin`);
      console.log(`   Password: ${defaultPassword}`);
      console.log('\n⚠️  Change this password immediately in production!');
    }

    console.log('\n✅ Database initialized successfully!');
    console.log('\nCollections ready:');
    console.log('  • products');
    console.log('  • users');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

initDB();
