const express = require('express');
const config = require('../config');

// ✅ Middleware importieren
const { authenticatedAPI, adminAPI } = require('../middleware');
const { loginLimiter, registrationLimiter } = require('../middleware/rateLimiting');
const { validateContentType } = require('../middleware/security');

// ✅ Route-Module importieren
const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const employeeRoutes = require('./employee');
const minijobRoutes = require('./minijob');

const router = express.Router();

// ✅ API Info Route
router.get('/', (req, res) => {
  res.json({
    message: '🚀 Schoppmann Time Tracking API',
    version: '2.0.0',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        base: '/api/auth',
        routes: [
          'POST /api/auth/register',
          'POST /api/auth/login', 
          'POST /api/auth/refresh',
          'GET /api/auth/profile',
          'PUT /api/auth/profile',
          'PUT /api/auth/change-password',
          'POST /api/auth/logout'
        ]
      },
      employee: {
        base: '/api/employee',
        description: 'Mitarbeiter-spezifische Routen',
        routes: [
          'GET /api/employee/profile',
          'PUT /api/employee/profile',
          'PUT /api/employee/change-password',
          'GET /api/employee/settings',
          'PUT /api/employee/settings',
          'GET /api/employee/minijob/current',
          'GET /api/employee/dashboard',
          'GET /api/employee/account-status',
          'POST /api/employee/logout'
        ]
      },
      admin: {
        base: '/api/admin',
        description: 'Administrator-spezifische Routen (nur für Admins)',
        routes: [
          'GET /api/admin/users',
          'GET /api/admin/users/:id',
          'POST /api/admin/users',
          'PUT /api/admin/users/:id',
          'PUT /api/admin/users/:id/settings',
          'PATCH /api/admin/users/:id/toggle-status',
          'DELETE /api/admin/users/:id',
          'GET /api/admin/stats/users',
          'GET /api/admin/create-first-admin',
          'POST /api/admin/reset-database',
          'POST /api/admin/reset-database-confirm'
        ]
      },
      minijob: {
        base: '/api/admin/minijob',
        description: 'Minijob-Verwaltung (nur für Admins)',
        routes: [
          'GET /api/admin/minijob/settings',
          'GET /api/admin/minijob/settings/current',
          'POST /api/admin/minijob/settings',
          'PUT /api/admin/minijob/settings/:id',
          'DELETE /api/admin/minijob/settings/:id',
          'POST /api/admin/minijob/settings/recalculate-periods',
          'POST /api/admin/minijob/settings/refresh-status',
          'GET /api/admin/minijob/stats'
        ]
      }
    },
    security: {
      authentication: 'JWT Bearer Token required',
      rateLimit: {
        general: `${config.rateLimit.general} requests per ${config.rateLimit.windowMs / 1000 / 60} minutes`,
        login: `${config.rateLimit.login} attempts per ${config.rateLimit.windowMs / 1000 / 60} minutes`,
        registration: '3 attempts per hour'
      }
    }
  });
});

// ✅ AUTH ROUTES
// Login und Registration haben spezielle Rate Limits
router.use('/auth/login', rateLimit.login);
router.use('/auth/register', rateLimit.registration);
router.use('/auth', authRoutes);

// ✅ EMPLOYEE ROUTES (Authentifizierung erforderlich)
router.use('/employee', authenticatedAPI, employeeRoutes);

// ✅ ADMIN ROUTES (Admin-Rechte erforderlich)
router.use('/admin', adminAPI, adminRoutes);

// ✅ MINIJOB ROUTES (unter Admin-Pfad, Admin-Rechte erforderlich)
router.use('/admin/minijob', adminAPI, minijobRoutes);

// ✅ Development Routes (nur in Development)
if (config.nodeEnv === 'development') {
  router.get('/dev/routes', (req, res) => {
    const routes = [];
    
    // Alle registrierten Routen extrahieren
    router.stack.forEach((middleware) => {
      if (middleware.route) {
        // Direkte Route
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      } else if (middleware.name === 'router') {
        // Sub-Router
        const basePath = middleware.regexp.source
          .replace('^\\\/', '')
          .replace('\\/?(?=\\/|$)', '')
          .replace(/\\\//g, '/');
        
        middleware.handle.stack.forEach((subRoute) => {
          if (subRoute.route) {
            routes.push({
              path: `/${basePath}${subRoute.route.path}`,
              methods: Object.keys(subRoute.route.methods)
            });
          }
        });
      }
    });

    res.json({
      message: '🔧 Development: Alle registrierten API-Routen',
      total: routes.length,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path))
    });
  });

  router.get('/dev/middleware', (req, res) => {
    res.json({
      message: '🔧 Development: Middleware-Informationen',
      config: {
        nodeEnv: config.nodeEnv,
        jwtSecret: config.jwt.secret ? `${config.jwt.secret.length} chars` : 'not set',
        refreshSecret: config.jwt.refreshSecret ? `${config.jwt.refreshSecret.length} chars` : 'not set',
        corsOrigins: config.cors.origin.length,
        rateLimit: {
          windowMs: config.rateLimit.windowMs,
          general: config.rateLimit.general,
          login: config.rateLimit.login
        }
      },
      middleware: {
        security: 'helmet + cors + headers',
        auth: 'JWT Bearer Token',
        validation: 'express-validator',
        rateLimit: 'express-rate-limit',
        database: 'sequelize + sqlite'
      }
    });
  });
}

// ✅ API Status Route (für Health Checks)
router.get('/status', (req, res) => {
  res.json({
    status: 'OK',
    message: '✅ API ist online und bereit',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '2.0.0',
    services: {
      database: 'connected',
      auth: 'ready',
      rateLimit: 'active'
    }
  });
});

// ✅ API Version Info
router.get('/version', (req, res) => {
  res.json({
    api: {
      name: 'Schoppmann Time Tracking API',
      version: '2.0.0',
      releaseDate: '2024-12-19',
      environment: config.nodeEnv
    },
    features: [
      'JWT Authentication',
      'Role-based Access Control',
      'Rate Limiting', 
      'Input Validation',
      'Minijob Management',
      'User Management',
      'Security Headers'
    ],
    dependencies: {
      express: require('express/package.json').version,
      sequelize: require('sequelize/package.json').version,
      jsonwebtoken: require('jsonwebtoken/package.json').version,
      bcryptjs: require('bcryptjs/package.json').version
    }
  });
});

// ✅ 404 Handler für API-Routen
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API-Endpoint nicht gefunden',
    code: 'ENDPOINT_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      auth: '/api/auth/*',
      employee: '/api/employee/*',
      admin: '/api/admin/*',
      minijob: '/api/admin/minijob/*',
      info: '/api/',
      status: '/api/status',
      version: '/api/version'
    },
    suggestion: 'Überprüfen Sie die API-Dokumentation unter /api/'
  });
});

// ✅ Error Handler für API-spezifische Fehler
router.use((error, req, res, next) => {
  console.error('❌ API Route Error:', error);
  
  // Rate Limit Errors
  if (error.statusCode === 429) {
    return res.status(429).json({
      success: false,
      error: 'API Rate Limit überschritten',
      code: 'API_RATE_LIMIT_EXCEEDED',
      retryAfter: error.retryAfter,
      timestamp: new Date().toISOString()
    });
  }
  
  // Validation Errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'API Validierungsfehler',
      code: 'API_VALIDATION_ERROR',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
  
  // JWT Errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Ungültiger API Token',
      code: 'API_INVALID_TOKEN',
      timestamp: new Date().toISOString()
    });
  }

  // Database Errors
  if (error.name === 'SequelizeError') {
    return res.status(500).json({
      success: false,
      error: 'Datenbankfehler',
      code: 'API_DATABASE_ERROR',
      message: config.nodeEnv === 'development' ? error.message : 'Kontaktieren Sie den Administrator',
      timestamp: new Date().toISOString()
    });
  }
  
  // Generic API Error
  res.status(500).json({
    success: false,
    error: 'Interner API-Fehler',
    code: 'API_INTERNAL_ERROR',
    message: config.nodeEnv === 'development' ? error.message : 'Kontaktieren Sie den Administrator',
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;