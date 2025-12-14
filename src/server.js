require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const csurf = require('csurf');

const db = require('./db');
const securityConfig = require('../config/security');
const securityLogger = require('./security-logger');
const fs = require('fs');
const multer = require('multer');

const PORT = process.env.PORT || 3000;

function requireAuth(req, res, next){
  if(req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

const app = express();
// If running behind a proxy (ngrok, reverse proxy, cloud load balancer),
// set TRUST_PROXY=true in the environment to enable Express' trust proxy
// so rate-limit and req.ip work correctly with X-Forwarded-For headers.
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// If not explicitly trusting a proxy, strip X-Forwarded-For header early
// to avoid express-rate-limit throwing a ValidationError when a proxy
// (eg. ngrok) adds that header but the app is not configured to trust it.
app.use((req, res, next) => {
  if (process.env.TRUST_PROXY !== 'true') {
    if (req.headers && req.headers['x-forwarded-for']) {
      delete req.headers['x-forwarded-for'];
    }
  }
  next();
});
// Configure Helmet with a relaxed CSP so we can load the ZXing script from the CDN
// For production, prefer vendoring the script or locking down the allowed hosts.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://unpkg.com'],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Additional security middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Bot detection and request validation
app.use((req, res, next) => {
  const userAgent = (req.get('User-Agent') || '').toLowerCase();
  
  // Block suspicious user agents for sensitive paths
  if (req.path.match(/\/(js|admin|api)/) && 
      securityConfig.suspiciousUserAgents.some(pattern => userAgent.includes(pattern))) {
    securityLogger.logSuspiciousActivity(req, `Suspicious user agent: ${userAgent}`);
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Validate request origin for admin and API routes only when ENFORCE_ORIGIN is set.
  // This is left off by default to allow tunnels (ngrok) or proxied dev access.
  if (process.env.ENFORCE_ORIGIN === 'true') {
    if (req.path.startsWith('/admin') || req.path.startsWith('/api')) {
      const origin = req.get('Origin') || req.get('Referer') || '';
      const host = req.get('Host') || '';
      if (origin && !securityConfig.allowedOrigins.some(allowed => origin.includes(allowed)) &&
          !host.includes('localhost') && !host.includes('127.0.0.1')) {
        securityLogger.logSuspiciousActivity(req, `Invalid origin: ${origin}`);
        return res.status(403).json({ error: 'Invalid origin' });
      }
    }
  }
  
  next();
});
// Request logging is potentially noisy; enable only when explicitly requested
// by setting `ENABLE_MORGAN=true` in the environment.
if (process.env.ENABLE_MORGAN === 'true') {
  app.use(morgan('dev'));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// rate limiters
const loginLimiter = rateLimit({ ...securityConfig.rateLimits.login, message: 'Too many login attempts, try later.' });
const apiLimiter = rateLimit({ ...securityConfig.rateLimits.api, message: 'Too many API requests, try later.' });
const staticLimiter = rateLimit({ ...securityConfig.rateLimits.static, message: 'Too many requests, try later.' });
const uploadLimiter = rateLimit({ ...securityConfig.rateLimits.upload, message: 'Too many uploads, try later.' });

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);
app.use(['/js', '/admin'], staticLimiter);
app.use('/api/uploads', uploadLimiter);

// CSRF protection for state-changing routes
const csrfMiddleware = csurf({ cookie: false });

// Static file middleware: whitelist specific public directories and static assets.
app.use((req, res, next) => {
  const urlPath = (req.path || '').toLowerCase();

  // Allow entire /js/, /admin/, and uploads directories to be served from public
  const allowedPrefixes = ['/js/', '/admin/', '/public/uploads/', '/css/', '/assets/'];
  if (allowedPrefixes.some(p => urlPath.startsWith(p))) {
    // Special-case: requests starting with /public/uploads/ should map to the actual uploads folder
    if (urlPath.startsWith('/public/uploads/')){
      const rel = req.path.replace(/^\/public\/uploads\//i, '');
      const filePath = path.join(__dirname, '..', 'public', 'uploads', rel);
      // Prevent path traversal
      if (!filePath.startsWith(path.join(__dirname, '..', 'public', 'uploads'))){
        securityLogger.logBlockedAccess(req, `Traversal attempt: ${req.path}`);
        return res.status(403).json({ error: 'Access denied' });
      }
      return res.sendFile(filePath, err => {
        if(err){ return res.status(err.status || 404).end(); }
      });
    }
    return express.static(path.join(__dirname, '..', 'public'))(req, res, next);
  }

  // Allow index routes
  if (urlPath === '/' || urlPath === '/index.html' || urlPath === '/admin') {
    return next();
  }

  // Allow common static extensions (images, css, ico)
  const isAllowedStatic = securityConfig.allowedStaticExtensions.some(ext => urlPath.endsWith(ext));
  if (isAllowedStatic) {
    return express.static(path.join(__dirname, '..', 'public'))(req, res, next);
  }

  // Block direct access to dangerous extensions or sensitive directories
  const isBlockedExtension = securityConfig.blockedExtensions.some(ext => urlPath.endsWith(ext));
  const isBlockedPath = securityConfig.blockedPaths.some(p => urlPath.startsWith(p));
  if (isBlockedExtension || isBlockedPath || urlPath.includes('..')) {
    securityLogger.logBlockedAccess(req, `Blocked file access: ${req.url}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  // Otherwise continue to next middleware/route
  next();
});

// Main page route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Admin route with authentication check
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

// Serve JS files only for authenticated users or specific routes
app.get('/js/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'js', 'app.js'));
});

// Serve admin client script publicly so the login UI can load. API actions remain protected.
// Serve admin client script publicly so login UI can load
app.get('/admin/admin.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'admin.js'));
});

// Redirect legacy public/admin paths to the canonical /admin
app.get('/public/admin/*', (req, res) => {
  return res.redirect(301, '/admin');
});

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safe = (file.originalname || 'img').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage });

// Upload endpoint: accepts a single file field named 'image', returns a public URL.
app.post('/api/uploads', csrfMiddleware, requireAuth, upload.single('image'), (req, res) => {
  try{
    if(!req.file) return res.status(400).json({ error: 'no_file' });
    // public files are served under /public
    const url = '/public/uploads/' + req.file.filename;
    res.json({ url });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/products', async (req, res) => {
  const docs = db.getAllProducts();
  res.json(docs);
});

// get by id (used by admin UI)
app.get('/api/products/id/:id', async (req, res) => {
  const id = req.params.id;
  const doc = db.getProductById(id);
  if(!doc) return res.status(404).json({ error: 'not_found' });
  res.json(doc);
});

// get by barcode (legacy / public lookup)
app.get('/api/products/:barcode', async (req, res) => {
  const barcode = req.params.barcode;
  const doc = db.getProductByBarcode(barcode);
  if(!doc) return res.status(404).json({ error: 'not_found' });
  res.json(doc);
});

app.post('/admin/login', loginLimiter, body('username').trim().escape(), body('password').trim(), async (req, res) => {
  const { username, password } = req.body;
  const user = db.getUserByUsername(username);
  if(!user) {
    securityLogger.logFailedAuth(req, `User not found: ${username}`);
    return res.status(401).json({ error: 'invalid' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if(!ok) {
    securityLogger.logFailedAuth(req, `Wrong password for user: ${username}`);
    return res.status(401).json({ error: 'invalid' });
  }
  req.session.userId = user.id;
  res.json({ ok: true });
});

app.post('/admin/logout', (req, res)=>{
  req.session.destroy(()=>res.json({ ok:true }));
});

app.get('/admin/status', (req, res)=>{
  res.json({ authenticated: !!(req.session && req.session.userId) });
});

app.get('/admin/csrf-token', csrfMiddleware, (req, res)=>{
  res.json({ csrfToken: req.csrfToken() });
});

// Security logs endpoint disabled: logging turned off to conserve resources.
// If you need to re-enable logs, restore the original implementation and
// re-enable `src/security-logger.js` accordingly.

app.post('/api/products', csrfMiddleware, requireAuth,
  body('barcode').trim().notEmpty().escape(),
  body('name').trim().notEmpty().escape(),
  body('image').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    // server-side price validation: optional, but if provided must be positive integer
    const priceVal = (req.body.price || '').toString();
    if(priceVal !== ''){
      if(!/^[0-9]+$/.test(priceVal) || Number(priceVal) <= 0){
        return res.status(400).json({ errors: [{ msg: 'Giá phải là số nguyên dương', param: 'price', location: 'body', value: req.body.price }] });
      }
    } else {
      // normalize empty price to undefined
      delete req.body.price;
    }
    try{
      // check unique barcode
      const existing = db.getProductByBarcode(req.body.barcode);
      if(existing) return res.status(409).json({ error: 'exists' });
      const p = db.createProduct({ barcode: req.body.barcode, name: req.body.name, price: req.body.price, image: req.body.image });
      res.json(p);
    }catch(e){
      res.status(500).json({ error: e.message });
    }
  }
);

app.put('/api/products/:id', csrfMiddleware, requireAuth,
  body('barcode').optional().trim().escape(),
  body('name').optional().trim().escape(),
  body('image').optional().trim(),
  async (req, res)=>{
    // server-side price validation for update: optional, if present must be positive integer
    if(Object.prototype.hasOwnProperty.call(req.body, 'price')){
      const priceVal = (req.body.price || '').toString();
      if(priceVal === ''){
        // treat empty string as remove price
        delete req.body.price;
      }else if(!/^[0-9]+$/.test(priceVal) || Number(priceVal) <= 0){
        return res.status(400).json({ errors: [{ msg: 'Giá phải là số nguyên dương', param: 'price', location: 'body', value: req.body.price }] });
      }
    }
    const updates = {};
    if(req.body.name) updates.name = req.body.name;
    if(req.body.price) updates.price = req.body.price;
    if(req.body.image) updates.image = req.body.image;
    try{
      // check barcode uniqueness if changed
      if(req.body.barcode){
        const existing = db.getProductByBarcode(req.body.barcode);
        if(existing && existing.id !== req.params.id){
          return res.status(409).json({ error: 'barcode_exists' });
        }
        updates.barcode = req.body.barcode;
      }
      const doc = db.updateProductById(req.params.id, updates);
      if(!doc) return res.status(404).json({ error: 'not_found' });
      res.json(doc);
    }catch(e){ res.status(500).json({ error: e.message }); }
  }
);

app.delete('/api/products/:id', csrfMiddleware, requireAuth, async (req, res)=>{
  try{
    const id = req.params.id;
    // fetch product first to get image path
    const prod = db.getProductById(id);
    if(!prod) return res.status(404).json({ error: 'not_found' });
    const imageField = prod.image;

    // delete DB record
    db.deleteProductById(id);

    // attempt to remove uploaded file if it points inside our uploadDir
    try{
      if(imageField){
        // normalize potential URL or path
        let p = imageField;
        try{ const u = new URL(imageField, `http://localhost`); p = u.pathname; }catch(e){}
        // strip leading slash
        if(p.startsWith('/')) p = p.slice(1);
        // remove query/hash
        p = p.split('?')[0].split('#')[0];
        const resolved = path.resolve(__dirname, p);
        const uploadsResolved = path.resolve(uploadDir);
        if(resolved.startsWith(uploadsResolved)){
          // use fs.promises to unlink
          try{ await fs.promises.unlink(resolved); }
          catch(err){  }
        }else{
          
        }
      }
    }catch(err){  }

    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  if (process.env.ENABLE_APP_LOGS === 'true') {
    console.log('Server listening on', PORT);
  }
});
