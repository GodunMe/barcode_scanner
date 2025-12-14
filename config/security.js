// Security configuration
module.exports = {
  // Blocked file extensions - direct access denied
  blockedExtensions: ['.js', '.json', '.env', '.log'],
  
  // Blocked directories - direct access denied
  blockedPaths: ['/config', '/scripts', '/src', '/node_modules'],
  
  // Allowed static file extensions
  allowedStaticExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.css', '.ico', '.svg'],
  
  // Suspicious user agent patterns
  suspiciousUserAgents: [
    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 
    'python', 'node-fetch', 'postman', 'insomnia'
  ],
  
  // Rate limiting configuration
  rateLimits: {
    login: { windowMs: 15 * 60 * 1000, max: 6 },
    api: { windowMs: 15 * 60 * 1000, max: 100 },
    static: { windowMs: 15 * 60 * 1000, max: 200 },
    upload: { windowMs: 15 * 60 * 1000, max: 20 }
  },
  
  // Security headers
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Permissions-Policy': 'camera=(self), microphone=()'
  },
  
  // Allowed origins for API/admin access
  allowedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]
};