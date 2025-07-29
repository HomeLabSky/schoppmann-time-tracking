const rateLimit = require('express-rate-limit');
const config = require('../config');

// ✅ Einfacher Ansatz für Development ohne custom key generators
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 15 Minuten
  max: config.rateLimit.general, // Max requests pro IP
  message: {
    success: false,
    error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ✅ Login Rate Limiting ohne custom keyGenerator
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
  legacyHeaders: false
});

// ✅ API Rate Limiting
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.general * 2,
  message: {
    success: false,
    error: 'API Rate Limit überschritten.',
    code: 'API_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  }
});

// ✅ Admin Rate Limiting
const adminLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.general * 3,
  message: {
    success: false,
    error: 'Admin Rate Limit überschritten.',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED',
    timestamp: new Date().toISOString()
  }
});

// ✅ Registration Rate Limiting
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 Stunde
  max: 3, // Max 3 Registrierungen pro Stunde pro IP
  message: {
    success: false,
    error: 'Zu viele Registrierungsversuche. Versuchen Sie es in einer Stunde erneut.',
    code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
    retryAfter: 3600,
    timestamp: new Date().toISOString()
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

module.exports = {
  generalLimiter,
  loginLimiter,
  apiLimiter,
  adminLimiter,
  registrationLimiter,
  developmentLimiter: createDevelopmentLimiter(),
  rateLimitStatus
};