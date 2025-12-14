const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');

// MongoDB connection
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/spm_barcode');
    if (process.env.ENABLE_APP_LOGS === 'true') {
      console.log('MongoDB connected');
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Product operations
async function getAllProducts() {
  try {
    return await Product.find().sort({ updatedAt: -1, createdAt: -1 });
  } catch (error) {
    console.error('Error getting products:', error);
    return [];
  }
}

async function getProductByBarcode(barcode) {
  try {
    return await Product.findOne({ barcode });
  } catch (error) {
    console.error('Error getting product by barcode:', error);
    return null;
  }
}

async function getProductById(id) {
  try {
    return await Product.findById(id);
  } catch (error) {
    console.error('Error getting product by id:', error);
    return null;
  }
}

async function createProduct({ barcode, name, price, image }) {
  try {
    const product = new Product({ barcode, name, price, image });
    await product.save();
    return product.toObject();
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
}

async function updateProductById(id, updates) {
  try {
    const product = await Product.findByIdAndUpdate(id, updates, { new: true });
    return product ? product.toObject() : null;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
}

async function deleteProductById(id) {
  try {
    await Product.findByIdAndDelete(id);
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

// User operations
async function getUserByUsername(username) {
  try {
    return await User.findOne({ username: username.toLowerCase() });
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

async function createUser({ username, passwordHash }) {
  try {
    const user = new User({ username, passwordHash });
    await user.save();
    return user.toObject();
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

async function updateUserPassword(username, passwordHash) {
  try {
    const user = await User.findOneAndUpdate(
      { username: username.toLowerCase() },
      { passwordHash },
      { new: true }
    );
    return user ? user.toObject() : null;
  } catch (error) {
    console.error('Error updating user password:', error);
    throw error;
  }
}

module.exports = {
  connectDB,
  getAllProducts,
  getProductByBarcode,
  getProductById,
  createProduct,
  updateProductById,
  deleteProductById,
  getUserByUsername,
  createUser,
  updateUserPassword
};
