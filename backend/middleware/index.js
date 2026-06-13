/**
 * Middleware-Barrel: stellt die tatsächlich genutzten Middleware-Kombinationen
 * bereit. Spezial-Limiter (login/registration) werden direkt aus
 * ./rateLimiting importiert, wo sie gebraucht werden.
 */
const authMiddleware = require('./auth');
const rateLimitingMiddleware = require('./rateLimiting');
const securityMiddleware = require('./security');

// Basis-Security-Stack (für app.js)
const basicSecurity = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  securityMiddleware.requestId
];

// Öffentliche API-Routen (ohne Auth)
const publicAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.generalLimiter,
  securityMiddleware.validateContentType
];

// Authentifizierte API-Routen
const authenticatedAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.apiLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.authenticateToken
];

// Admin-only API-Routen
const adminAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.adminLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.requireAdmin
];

module.exports = {
  basicSecurity,
  publicAPI,
  authenticatedAPI,
  adminAPI,
  generalLimiter: rateLimitingMiddleware.generalLimiter
};
