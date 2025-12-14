const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

async function main(){
  const argv = process.argv.slice(2);
  if(argv.length < 1){
    console.error('Usage: node reset_admin.js <newPassword> [username]');
    process.exit(2);
  }
  const newPass = argv[0];
  const username = argv[1] || process.env.ADMIN_USER || 'admin';
  const dbPath = path.join(__dirname, '..', 'db.json');
  let db = { products: [], users: [] };
  try{
    if(fs.existsSync(dbPath)){
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
  }catch(e){ console.error('Cannot read db.json', e); process.exit(1); }

  const hash = await bcrypt.hash(newPass, 10);
  const idx = (db.users||[]).findIndex(u=>u.username === username);
  if(idx >= 0){
    db.users[idx].passwordHash = hash;
    if (process.env.ENABLE_APP_LOGS === 'true') console.log('Updated password for user', username);
  }else{
    db.users = db.users || [];
    db.users.push({ id: Date.now().toString(36), username, passwordHash: hash });
    if (process.env.ENABLE_APP_LOGS === 'true') console.log('Created user', username);
  }

  try{
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    if (process.env.ENABLE_APP_LOGS === 'true') console.log('db.json updated.');
  }catch(e){ console.error('Cannot write db.json', e); process.exit(1); }
}

main().catch(e=>{ console.error(e); process.exit(1); });
