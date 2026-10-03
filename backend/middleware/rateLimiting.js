const rateLimit = require('express-rate-limit');
const config = require('../config');

// Allgemeine Begrenzung pro IP (hinter einem Proxy: TRUST_PROXY setzen)
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

// Anmeldung (Web und App) pro IP; zusätzlich sperrt services/loginThrottle.js das einzelne Konto
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

// API Rate Limiting
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

// Admin Rate Limiting
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

// Registration Rate Limiting
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

module.exports = {
  generalLimiter,
  loginLimiter,
  apiLimiter,
  adminLimiter,
  registrationLimiter
};