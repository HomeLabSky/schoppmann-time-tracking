const cors = require('cors');
const helmet = require('helmet');
const config = require('../config');

// ✅ CORS Configuration
const corsOptions = {
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 
    'X-Requested-With', 
    'Content-Type', 
    'Accept', 
    'X-CSRF-Protection'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count', 
    'RateLimit-Limit',
    'RateLimit-Remaining',
    'RateLimit-Reset'
  ]
};

// ✅ CORS Middleware
const corsMiddleware = cors(corsOptions);

// ✅ Helmet Security Headers
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    reportOnly: config.nodeEnv === 'development' // In Development nur warnen
  },
  crossOriginEmbedderPolicy: false, // Für lokale Entwicklung
  hsts: {
    maxAge: config.nodeEnv === 'production' ? 31536000 : 0, // HSTS nur in Production
    includeSubDomains: true,
    preload: true
  }
});

// ✅ Request ID Middleware (für Logging/Debugging)
const requestId = (req, res, next) => {
  const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
  req.id = id;
  res.setHeader('X-Request-ID', id);
  
  if (config.nodeEnv === 'development') {
    console.log(`🆔 Request ID: ${id} - ${req.method} ${req.path} from ${req.ip}`);
  }
  
  next();
};

// ✅ Content-Type Validation Middleware
const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type muss application/json sein',
        code: 'INVALID_CONTENT_TYPE',
        received: contentType || 'none',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

// ✅ Security Headers Middleware
const securityHeaders = (req, res, next) => {
  // Zusätzliche Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove Server Header (versteckt Express)
  res.removeHeader('X-Powered-By');
  
  next();
};

module.exports = {
  corsMiddleware,
  helmetMiddleware,
  requestId,
  validateContentType,
  securityHeaders,
  corsOptions
};