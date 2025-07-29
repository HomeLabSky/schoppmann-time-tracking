// ✅ Middleware Index - Zentrale Stelle für alle Middleware

//Direkte Imports statt destructuring um zirkuläre Imports zu vermeiden
const authMiddleware = require('./auth');
const validationMiddleware = require('./validation');
const rateLimitingMiddleware = require('./rateLimiting');
const securityMiddleware = require('./security');

// ✅ Middleware-Gruppen für einfache Nutzung

// Basic Security Stack
const basicSecurity = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  securityMiddleware.requestId
];

// Auth Stack
const authStack = {
  token: authMiddleware.authenticateToken,
  admin: authMiddleware.requireAdmin,
  employee: authMiddleware.requireEmployee,
  extract: authMiddleware.extractTokenInfo,
  debug: authMiddleware.debugAuth
};

// Validation Stack
const validationStack = {
  registration: [...validationMiddleware.validateRegistration, validationMiddleware.handleValidationErrors],
  login: [...validationMiddleware.validateLogin, validationMiddleware.handleValidationErrors],
  userUpdate: [...validationMiddleware.validateUserUpdate, validationMiddleware.handleValidationErrors],
  userSettings: [...validationMiddleware.validateUserSettings, validationMiddleware.handleValidationErrors],
  minijobSetting: [...validationMiddleware.validateMinijobSetting, validationMiddleware.handleValidationErrors],
  sanitize: validationMiddleware.sanitizeInput,
  errors: validationMiddleware.handleValidationErrors
};

// Rate Limiting Stack
const rateLimitStack = {
  general: rateLimitingMiddleware.generalLimiter,
  login: rateLimitingMiddleware.loginLimiter,
  api: rateLimitingMiddleware.apiLimiter,
  admin: rateLimitingMiddleware.adminLimiter,
  registration: rateLimitingMiddleware.registrationLimiter,
  development: rateLimitingMiddleware.developmentLimiter,
  status: rateLimitingMiddleware.rateLimitStatus
};

// Security Stack
const securityStack = {
  cors: securityMiddleware.corsMiddleware,
  helmet: securityMiddleware.helmetMiddleware,
  headers: securityMiddleware.securityHeaders,
  requestId: securityMiddleware.requestId,
  contentType: securityMiddleware.validateContentType,
  sizeLimit: securityMiddleware.requestSizeLimit(),
  development: securityMiddleware.developmentSecurity,
  ipWhitelist: securityMiddleware.ipWhitelist
};

// ✅ Vordefinierte Middleware-Kombinationen

// Öffentliche API Routes (ohne Auth)
const publicAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.generalLimiter,
  securityMiddleware.validateContentType
];

// Authentifizierte API Routes
const authenticatedAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.apiLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.authenticateToken
];

// Admin-only API Routes
const adminAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.adminLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.requireAdmin
];

// Login-spezifische Middleware
const loginAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.loginLimiter,
  securityMiddleware.validateContentType,
  ...validationMiddleware.validateLogin,
  validationMiddleware.handleValidationErrors
];

// Registrierung-spezifische Middleware
const registrationAPI = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders,
  rateLimitingMiddleware.registrationLimiter,
  securityMiddleware.validateContentType,
  ...validationMiddleware.validateRegistration,
  validationMiddleware.handleValidationErrors
];

module.exports = {
  // Einzelne Middleware
  auth: authStack,
  validation: validationStack,
  rateLimit: rateLimitStack,
  security: securityStack,

  // Middleware-Gruppen
  basicSecurity,

  // Vordefinierte Kombinationen
  publicAPI,
  authenticatedAPI,
  adminAPI,
  loginAPI,
  registrationAPI,

  // Legacy-Support (einzelne Exporte)
  authenticateToken: authMiddleware.authenticateToken,
  requireAdmin: authMiddleware.requireAdmin,
  requireEmployee: authMiddleware.requireEmployee,
  validateRegistration: validationMiddleware.validateRegistration,
  validateLogin: validationMiddleware.validateLogin,
  handleValidationErrors: validationMiddleware.handleValidationErrors,
  generalLimiter: rateLimitingMiddleware.generalLimiter,
  loginLimiter: rateLimitingMiddleware.loginLimiter,
  corsMiddleware: securityMiddleware.corsMiddleware,
  helmetMiddleware: securityMiddleware.helmetMiddleware
};