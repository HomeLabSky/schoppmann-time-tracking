// ✅ Middleware Index - Zentrale Stelle für alle Middleware

// Authentication & Authorization
const {
  authenticateToken,
  requireAdmin,
  requireEmployee,
  extractTokenInfo,
  debugAuth
} = require('./auth');

// Input Validation
const {
  validateRegistration,
  validateLogin,
  validateUserUpdate,
  validateUserSettings,
  validateMinijobSetting,
  handleValidationErrors,
  customValidations,
  sanitizeInput
} = require('./validation');

// Rate Limiting
const {
  generalLimiter,
  loginLimiter,
  apiLimiter,
  adminLimiter,
  registrationLimiter,
  developmentLimiter,
  rateLimitStatus
} = require('./rateLimiting');

// Security
const {
  corsMiddleware,
  helmetMiddleware,
  requestId,
  ipWhitelist,
  validateContentType,
  requestSizeLimit,
  securityHeaders,
  developmentSecurity,
  corsOptions
} = require('./security');

// ✅ Middleware-Gruppen für einfache Nutzung

// Basic Security Stack
const basicSecurity = [
  helmetMiddleware,
  corsMiddleware,
  securityHeaders,
  requestId
];

// Auth Stack
const authStack = {
  token: authenticateToken,
  admin: requireAdmin,
  employee: requireEmployee,
  extract: extractTokenInfo,
  debug: debugAuth
};

// Validation Stack
const validationStack = {
  registration: [...validateRegistration, handleValidationErrors],
  login: [...validateLogin, handleValidationErrors],
  userUpdate: [...validateUserUpdate, handleValidationErrors],
  userSettings: [...validateUserSettings, handleValidationErrors],
  minijobSetting: [...validateMinijobSetting, handleValidationErrors],
  sanitize: sanitizeInput,
  errors: handleValidationErrors
};

// Rate Limiting Stack
const rateLimitStack = {
  general: generalLimiter,
  login: loginLimiter,
  api: apiLimiter,
  admin: adminLimiter,
  registration: registrationLimiter,
  development: developmentLimiter,
  status: rateLimitStatus
};

// Security Stack
const securityStack = {
  cors: corsMiddleware,
  helmet: helmetMiddleware,
  headers: securityHeaders,
  requestId: requestId,
  contentType: validateContentType,
  sizeLimit: requestSizeLimit(),
  development: developmentSecurity,
  ipWhitelist: ipWhitelist
};

// ✅ Vordefinierte Middleware-Kombinationen

// Öffentliche API Routes (ohne Auth)
const publicAPI = [
  ...basicSecurity,
  rateLimitStack.general,
  validateContentType
];

// Authentifizierte API Routes
const authenticatedAPI = [
  ...basicSecurity,
  rateLimitStack.api,
  validateContentType,
  authStack.token
];

// Admin-only API Routes
const adminAPI = [
  ...basicSecurity,
  rateLimitStack.admin,
  validateContentType,
  authStack.admin
];

// Login-spezifische Middleware
const loginAPI = [
  ...basicSecurity,
  rateLimitStack.login,
  validateContentType,
  ...validationStack.login
];

// Registrierung-spezifische Middleware
const registrationAPI = [
  ...basicSecurity,
  rateLimitStack.registration,
  validateContentType,
  ...validationStack.registration
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
  authenticateToken,
  requireAdmin,
  requireEmployee,
  validateRegistration,
  validateLogin,
  handleValidationErrors,
  generalLimiter,
  loginLimiter,
  corsMiddleware,
  helmetMiddleware
};