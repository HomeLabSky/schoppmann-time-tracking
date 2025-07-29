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
    'Authorization'
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

// ✅ IP Whitelist Middleware (optional, für Production)
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (config.nodeEnv !== 'production' || allowedIPs.length === 0) {
      return next(); // In Development oder ohne Whitelist durchlassen
    }
    
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.includes(clientIP)) {
      next();
    } else {
      console.log(`🚫 IP blocked: ${clientIP}`);
      res.status(403).json({
        success: false,
        error: 'IP-Adresse nicht autorisiert',
        code: 'IP_NOT_ALLOWED',
        timestamp: new Date().toISOString()
      });
    }
  };
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

// ✅ Request Size Limiting
const requestSizeLimit = (limit = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const maxBytes = parseSize(limit);
      if (parseInt(contentLength) > maxBytes) {
        return res.status(413).json({
          success: false,
          error: `Request zu groß. Maximum: ${limit}`,
          code: 'PAYLOAD_TOO_LARGE',
          maxSize: limit,
          receivedSize: formatBytes(parseInt(contentLength)),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    next();
  };
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

// ✅ Development Security Override
const developmentSecurity = (req, res, next) => {
  if (config.nodeEnv === 'development') {
    // In Development weniger strenge Sicherheit
    res.setHeader('Access-Control-Allow-Origin', '*');
    console.log(`🔓 Development: Relaxed security for ${req.path}`);
  }
  next();
};

// Helper Functions
const parseSize = (size) => {
  const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = size.toString().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  return Math.floor(parseFloat(match[1]) * units[match[2].toLowerCase()]);
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = {
  corsMiddleware,
  helmetMiddleware,
  requestId,
  ipWhitelist,
  validateContentType,
  requestSizeLimit,
  securityHeaders,
  developmentSecurity,
  corsOptions
};