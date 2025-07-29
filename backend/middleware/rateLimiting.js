const rateLimit = require('express-rate-limit');
const config = require('../config');

// ✅ IPv6-sicherer Key Generator Helper
const createSafeKeyGenerator = (customGenerator) => {
  return (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    // IPv6-sichere IP-Behandlung
    const safeIp = ip.includes(':') ? `[${ip}]` : ip;
    return customGenerator ? customGenerator(req, res, safeIp) : safeIp;
  };
};

// ✅ Allgemeines Rate Limiting
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 Minuten
  max: config.rateLimit.general, // Max requests pro IP
  message: {
    success: false,
    error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000), // Sekunden
    timestamp: new Date().toISOString()
  },
  standardHeaders: true, // Rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    console.log(`⚠️ Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      success: false,
      error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Strenges Login Rate Limiting
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 Minuten
  max: config.rateLimit.login, // Max 5 Login-Versuche
  message: {
    success: false,
    error: 'Zu viele Login-Versuche. Versuchen Sie es in 15 Minuten erneut.',
    code: 'LOGIN_RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createSafeKeyGenerator((req, res, safeIp) => {
    // Rate limiting basierend auf IP + Email (falls vorhanden)
    const email = req.body?.email || '';
    return `${safeIp}-${email}`;
  }),
  handler: (req, res) => {
    console.log(`🚨 Login rate limit exceeded for IP: ${req.ip}, Email: ${req.body?.email || 'unknown'}`);
    res.status(429).json({
      success: false,
      error: 'Zu viele Login-Versuche. Versuchen Sie es in 15 Minuten erneut.',
      code: 'LOGIN_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ API-spezifisches Rate Limiting
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.general * 2, // API kann mehr Requests haben
  message: {
    success: false,
    error: 'API Rate Limit überschritten.',
    code: 'API_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  }
});

// ✅ Admin-Aktionen Rate Limiting (weniger streng für Admins)
const adminLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.general * 3, // Admins haben höhere Limits
  message: {
    success: false,
    error: 'Admin Rate Limit überschritten.',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  },
  keyGenerator: createSafeKeyGenerator((req, res, safeIp) => {
    // Rate limiting basierend auf User-ID statt IP für authentifizierte Requests
    return req.user?.userId || safeIp;
  })
});

// ✅ Registration Rate Limiting (sehr streng)
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 Stunde
  max: 3, // Max 3 Registrierungen pro Stunde pro IP
  message: {
    success: false,
    error: 'Zu viele Registrierungsversuche. Versuchen Sie es in einer Stunde erneut.',
    code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
    retryAfter: 3600, // 1 Stunde in Sekunden
    timestamp: new Date().toISOString()
  },
  keyGenerator: createSafeKeyGenerator(), // Standard IP-basiert
  handler: (req, res) => {
    console.log(`🚨 Registration rate limit exceeded for IP: ${req.ip}, Email: ${req.body?.email || 'unknown'}`);
    res.status(429).json({
      success: false,
      error: 'Zu viele Registrierungsversuche. Versuchen Sie es in einer Stunde erneut.',
      code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
      retryAfter: 3600,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Development Rate Limiter (sehr lockere Limits)
const createDevelopmentLimiter = () => {
  if (config.nodeEnv !== 'development') {
    return generalLimiter;
  }
  
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.general * 10, // 10x höhere Limits in Development
    message: {
      success: false,
      error: 'Development Rate Limit (sehr hoch)',
      code: 'DEV_RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString()
    }
  });
};

// ✅ Rate Limit Status Middleware (für Debugging)
const rateLimitStatus = (req, res, next) => {
  if (config.nodeEnv === 'development') {
    const remaining = res.getHeader('RateLimit-Remaining');
    const limit = res.getHeader('RateLimit-Limit');
    const reset = res.getHeader('RateLimit-Reset');
    
    if (remaining !== undefined) {
      console.log(`🔄 Rate Limit: ${remaining}/${limit} remaining, resets at ${new Date(reset * 1000).toLocaleTimeString()}`);
    }
  }
  next();
};

// ✅ Korrekte Exporte
module.exports = {
  generalLimiter,
  loginLimiter,
  apiLimiter,
  adminLimiter,
  registrationLimiter,
  developmentLimiter: createDevelopmentLimiter(),
  rateLimitStatus,
  // Helper für externe Nutzung
  createSafeKeyGenerator
};