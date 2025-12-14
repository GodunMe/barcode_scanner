const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbFile = path.join(root, 'db.json');
const uploadsDir = path.join(root, 'public', 'uploads');

function extractFilenameFromImageField(img){
  if(!img) return null;
  try{
    // if it's a full URL, get pathname
    let p = img;
    try{ const u = new URL(img, 'http://example'); p = u.pathname; }catch(e){}
    // accept values like '/public/uploads/xxx.jpg' or 'public/uploads/xxx.jpg' or '/uploads/xxx.jpg' or just filename
    // normalize
    p = p.split('?')[0].split('#')[0];
    p = p.replace(/^\//, '');
    // if path contains uploads segment, return basename
    const parts = p.split('/');
    const idx = parts.lastIndexOf('uploads');
    if(idx >= 0 && parts.length > idx+1){
      return parts.slice(idx+1).join('/');
    }
    // otherwise if string contains only a filename, return it
    if(path.basename(p) === p) return p;
    return path.basename(p);
  }catch(e){ return null; }
}

(async function(){
  if(!fs.existsSync(dbFile)){
    console.error('db.json not found at', dbFile);
    process.exit(1);
  }
  if(!fs.existsSync(uploadsDir)){
    console.error('uploads dir not found at', uploadsDir);
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const products = db.products || [];
  const referenced = new Set();
  products.forEach(p=>{
    const fn = extractFilenameFromImageField(p.image);
    if(fn) referenced.add(fn);
  });

  const files = fs.readdirSync(uploadsDir);
  let removed = 0;
  files.forEach(f=>{
    // skip hidden files
    if(f.startsWith('.')) return;
    if(!referenced.has(f)){
      const fp = path.join(uploadsDir, f);
      try{
        fs.unlinkSync(fp);
        if (process.env.ENABLE_APP_LOGS === 'true') console.log('Deleted orphan:', f);
        removed++;
      }catch(e){ console.warn('Failed to delete', f, e.message); }
    }
  });
  if (process.env.ENABLE_APP_LOGS === 'true') console.log('Done. Removed', removed, 'files.');
})();
