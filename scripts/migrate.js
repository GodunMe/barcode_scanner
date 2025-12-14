require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

async function run(){
  const data = JSON.parse(fs.readFileSync(path.join(__dirname,'products.json'), 'utf8'));
  const keys = Object.keys(data);
  for(const barcode of keys){
    const item = data[barcode];
    const existing = db.getProductByBarcode(barcode);
    if(existing){
      db.updateProductById(existing.id, { name: item.name, price: item.price, image: item.image });
    }else{
      db.createProduct({ barcode, name: item.name, price: item.price, image: item.image });
    }
  }
  if (process.env.ENABLE_APP_LOGS === 'true') console.log('Imported', keys.length, 'products');

  // create admin user if not exists
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const existingUser = db.getUserByUsername(adminUser);
  if(!existingUser){
    const hash = await bcrypt.hash(adminPass, 10);
    db.createUser({ username: adminUser, passwordHash: hash });
    if (process.env.ENABLE_APP_LOGS === 'true') console.log('Created admin user:', adminUser, '(change ADMIN_PASSWORD env var)');
  }else{
    if (process.env.ENABLE_APP_LOGS === 'true') console.log('Admin user exists:', adminUser);
  }
}

run().catch(err=>{ console.error(err); process.exit(1); });
