const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { nanoid } = require('nanoid');
const path = require('path');
const adapter = new FileSync(path.join(__dirname, '..', 'db.json'));
const db = low(adapter);

db.defaults({ products: [], users: [] }).write();

function getAllProducts(){
  return db.get('products').value();
}

function getProductByBarcode(barcode){
  return db.get('products').find({ barcode }).value();
}

function getProductById(id){
  return db.get('products').find({ id }).value();
}

function createProduct({ barcode, name, price, image }){
  const p = { id: nanoid(), barcode, name, price, image };
  db.get('products').push(p).write();
  return p;
}

function updateProductById(id, updates){
  db.get('products').find({ id }).assign(updates).write();
  return getProductById(id);
}

function deleteProductById(id){
  db.get('products').remove({ id }).write();
}

function getUserByUsername(username){
  return db.get('users').find({ username }).value();
}

function createUser({ username, passwordHash }){
  const u = { id: nanoid(), username, passwordHash };
  db.get('users').push(u).write();
  return u;
}

module.exports = {
  getAllProducts,
  getProductByBarcode,
  getProductById,
  createProduct,
  updateProductById,
  deleteProductById,
  getUserByUsername,
  createUser
};
