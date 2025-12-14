#!/usr/bin/env node
/**
 * Migration script: lowdb (db.json) → MongoDB
 * 
 * Usage:
 *   MONGODB_URI=mongodb://... node scripts/migrate-to-mongo.js
 * 
 * Or with local MongoDB:
 *   node scripts/migrate-to-mongo.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spm_barcode';
const DB_JSON_PATH = path.join(__dirname, '..', 'db.json');

async function migrate() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Read db.json
    if (!fs.existsSync(DB_JSON_PATH)) {
      console.error('❌ db.json not found at', DB_JSON_PATH);
      process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(DB_JSON_PATH, 'utf8'));
    console.log('Loaded db.json:', DB_JSON_PATH);

    // Clear existing collections
    console.log('\nClearing existing collections...');
    await Product.deleteMany({});
    await User.deleteMany({});
    console.log('✅ Collections cleared');

    // Migrate products
    console.log('\nMigrating products...');
    const products = data.products || [];
    if (products.length > 0) {
      // Map old id field to MongoDB _id if needed, but MongoDB will auto-generate _id
      const productsToInsert = products.map(p => ({
        barcode: p.barcode,
        name: p.name,
        price: p.price || undefined,
        image: p.image || undefined,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date()
      }));
      const inserted = await Product.insertMany(productsToInsert);
      console.log(`✅ Migrated ${inserted.length} products`);
    } else {
      console.log('⚠️  No products to migrate');
    }

    // Migrate users
    console.log('\nMigrating users...');
    const users = data.users || [];
    if (users.length > 0) {
      const usersToInsert = users.map(u => ({
        username: u.username.toLowerCase(),
        passwordHash: u.passwordHash,
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date()
      }));
      const inserted = await User.insertMany(usersToInsert);
      console.log(`✅ Migrated ${inserted.length} users`);
    } else {
      console.log('⚠️  No users to migrate');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Verify data in MongoDB');
    console.log('2. Test login with your admin credentials');
    console.log('3. Back up or remove db.json to avoid confusion');
    console.log('4. Deploy to production (set MONGODB_URI environment variable)');

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

migrate();
