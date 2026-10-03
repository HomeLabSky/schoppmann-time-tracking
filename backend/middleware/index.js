/**
 * Middleware-Barrel: Kombinationen für app.js und routes/index.js.
 *
 * Die Berechtigung steht an jeder einzelnen Route (lib/route.js, Feld `auth`) und damit auch im
 * OpenAPI-Dokument. Die Einhängepunkte prüfen zusätzlich (doppelt hält besser: eine neue Route unter
 * /admin ohne `auth: 'admin'` ist trotzdem geschützt). Die Prüfung läuft je Anfrage nur einmal.
 */
const authMiddleware = require('./auth');
const rateLimitingMiddleware = require('./rateLimiting');
const securityMiddleware = require('./security');

// Basis-Security-Stack (für app.js)
const basicSecurity = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders
];

// Angemeldete Benutzer
const authenticatedAPI = [
  rateLimitingMiddleware.apiLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.authenticateToken
];

// Nur Admins
const adminAPI = [
  rateLimitingMiddleware.adminLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.requireAdmin
];

module.exports = {
  basicSecurity,
  authenticatedAPI,
  adminAPI,
  generalLimiter: rateLimitingMiddleware.generalLimiter
};
