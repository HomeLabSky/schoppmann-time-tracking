const express = require('express');
const config = require('../config');

// ✅ Middleware importieren
const { publicAPI, authenticatedAPI, adminAPI } = require('../middleware');
const { loginLimiter, registrationLimiter } = require('../middleware/rateLimiting');

// ✅ Route-Module importieren
const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const employeeRoutes = require('./employee');
const minijobRoutes = require('./minijob');
const setupRoutes = require('./setup');
const timeTrackingRoutes = require('./timetracking'); // ✅ TimeTracking Routes

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
      timeTracking: {
        base: '/api/timetracking',
        description: 'Zeiterfassungs-API für alle authentifizierten Benutzer',
        routes: [
          'GET /api/timetracking?month=YYYY-MM',
          'GET /api/timetracking/periods',
          'GET /api/timetracking/:id',
          'POST /api/timetracking',
          'PUT /api/timetracking/:id',
          'DELETE /api/timetracking/:id',
          'GET /api/timetracking/stats/multi-month'
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

// ============ ROUTE REGISTRIERUNGEN ============

// ✅ AUTH ROUTES
// Login und Registration haben spezielle Rate Limits
router.use('/auth/login', loginLimiter);
router.use('/auth/register', registrationLimiter);
router.use('/auth', authRoutes);

// ✅ SETUP ROUTES (Öffentlich - für erste Einrichtung)
router.use('/setup', publicAPI, setupRoutes);

// ✅ ZEITERFASSUNG ROUTES (Authentifizierung erforderlich)
router.use('/timetracking', authenticatedAPI, timeTrackingRoutes); // ✅ FEHLTE VORHER!

// ✅ EMPLOYEE ROUTES (Authentifizierung erforderlich)
router.use('/employee', authenticatedAPI, employeeRoutes);

// ✅ ADMIN ROUTES (Admin-Berechtigung erforderlich)
router.use('/admin', adminAPI, adminRoutes);

// ✅ MINIJOB ROUTES (Teil der Admin-Routes)
router.use('/admin/minijob', adminAPI, minijobRoutes);

// ============ DEVELOPMENT ROUTES ============

// Development Routes (nur in Development verfügbar)
if (config.nodeEnv === 'development') {
  router.get('/dev/routes', (req, res) => {
    res.json({
      message: '🔧 Development: Verfügbare API-Routen',
      environment: config.nodeEnv,
      routes: {
        public: [
          'GET /api/',
          'GET /api/status',
          'GET /api/version',
          'GET /api/setup/*'
        ],
        auth: [
          'POST /api/auth/register',
          'POST /api/auth/login',
          'POST /api/auth/refresh',
          'GET /api/auth/profile',
          'PUT /api/auth/profile',
          'PUT /api/auth/change-password',
          'POST /api/auth/logout'
        ],
        timetracking: [
          'GET /api/timetracking?month=YYYY-MM',
          'GET /api/timetracking/periods',
          'GET /api/timetracking/:id',
          'POST /api/timetracking',
          'PUT /api/timetracking/:id',
          'DELETE /api/timetracking/:id',
          'GET /api/timetracking/stats/multi-month'
        ],
        employee: [
          'GET /api/employee/profile',
          'PUT /api/employee/profile',
          'PUT /api/employee/change-password',
          'GET /api/employee/settings',
          'PUT /api/employee/settings',
          'GET /api/employee/minijob/current',
          'GET /api/employee/dashboard',
          'GET /api/employee/account-status',
          'POST /api/employee/logout'
        ],
        admin: [
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
        ],
        minijob: [
          'GET /api/admin/minijob/settings',
          'GET /api/admin/minijob/settings/current',
          'POST /api/admin/minijob/settings',
          'PUT /api/admin/minijob/settings/:id',
          'DELETE /api/admin/minijob/settings/:id',
          'POST /api/admin/minijob/settings/recalculate-periods',
          'POST /api/admin/minijob/settings/refresh-status',
          'GET /api/admin/minijob/stats'
        ]
      },
      middleware: {
        publicAPI: 'Keine Authentifizierung erforderlich',
        authenticatedAPI: 'JWT Token erforderlich', 
        adminAPI: 'Admin-Rolle erforderlich'
      }
    });
  });

  router.get('/dev/middleware', (req, res) => {
    res.json({
      message: '🔧 Development: Middleware-Information',
      middleware: {
        security: [
          'helmet (Security Headers)',
          'cors (Cross-Origin)',
          'express-rate-limit (Rate Limiting)'
        ],
        authentication: [
          'JWT Verification',
          'Token Refresh Handling',
          'Role-based Access Control'
        ],
        validation: [
          'express-validator',
          'Request Body Validation',
          'Parameter Validation'
        ],
        database: [
          'Sequelize ORM',
          'SQLite Database',
          'Model Associations'
        ]
      },
      config: {
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
      'Time Tracking',
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
      timetracking: '/api/timetracking/*',
      employee: '/api/employee/*',
      admin: '/api/admin/*',
      minijob: '/api/admin/minijob/*',
      setup: '/api/setup/*'
    }
  });
});

module.exports = router;