/**
 * Express-App-Aufbau (ohne Netzwerk-Listener).
 *
 * Diese Datei konstruiert und konfiguriert die Express-Anwendung:
 * Middleware-Stack, API-Routen, Basis-Routen (/, /health), 404- und
 * zentraler Error-Handler. Sie ruft NICHT `listen()` auf und initialisiert
 * NICHT die Datenbank – das übernimmt server.js (Produktion) bzw. das
 * Smoke-Test-Skript (Test). Dadurch ist die App ohne offenen Port testbar.
 *
 * Der DB-Verbindungsstatus wird über `app.locals.dbConnected` bereitgestellt
 * und vom jeweiligen Starter (server.js / Test) gesetzt.
 */
require('dotenv').config();
const express = require('express');
const config = require('./config');

const { basicSecurity, generalLimiter } = require('./middleware');
const apiRoutes = require('./routes');

const app = express();

// Wird vom Starter (server.js) nach erfolgreicher DB-Initialisierung gesetzt.
app.locals.dbConnected = false;

// ✅ Basic Security Middleware (CORS, Helmet, etc.)
app.use(basicSecurity);

// ✅ Body Parser mit Größenlimit
app.use(express.json({ limit: '10mb' }));

// ✅ General Rate Limiting
app.use(generalLimiter);

// ✅ API Routes verwenden
app.use('/api', apiRoutes);

// ✅ Root Route
app.get('/', (req, res) => {
  const dbConnected = req.app.locals.dbConnected;
  res.json({
    message: '🚀 Schoppmann Time Tracking Server',
    version: '2.0.0',
    environment: config.nodeEnv,
    status: 'online',
    timestamp: new Date().toISOString(),
    database: {
      connected: dbConnected,
      dialect: config.database.dialect,
      models: dbConnected ? ['User', 'MinijobSetting'] : []
    },
    api: {
      version: '2.0.0',
      baseUrl: '/api',
      documentation: '/api/',
      endpoints: {
        auth: '/api/auth/*',
        employee: '/api/employee/*',
        admin: '/api/admin/*',
        minijob: '/api/admin/minijob/*'
      }
    },
    middleware: {
      security: 'active',
      auth: 'ready',
      validation: 'ready',
      rateLimit: 'active'
    },
    links: {
      api: '/api/',
      health: '/api/status',
      version: '/api/version'
    }
  });
});

// ✅ Health Check Route
app.get('/health', (req, res) => {
  const dbConnected = req.app.locals.dbConnected;
  res.json({
    message: '✅ Schoppmann Time Tracking Server läuft!',
    timestamp: new Date().toISOString(),
    status: 'OK',
    environment: config.nodeEnv,
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
    },
    version: {
      api: '2.0.0',
      express: require('express/package.json').version,
      node: process.version
    },
    database: {
      dialect: config.database.dialect,
      storage: config.database.storage,
      connected: dbConnected,
      models: dbConnected ? ['User', 'MinijobSetting'] : []
    },
    security: {
      jwtConfigured: !!config.jwt.secret,
      corsOrigins: config.cors.origin.length,
      helmet: true,
      rateLimiting: true
    }
  });
});

// ✅ 404 Handler für alle anderen Routen
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route nicht gefunden',
    code: 'ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableRoutes: {
      root: '/',
      health: '/health',
      api: '/api/',
      endpoints: {
        auth: '/api/auth/*',
        employee: '/api/employee/*',
        admin: '/api/admin/*',
        minijob: '/api/admin/minijob/*'
      }
    },
    suggestion: 'Überprüfen Sie die verfügbaren Endpunkte unter /api/'
  });
});

// ✅ Zentraler Error Handler
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);

  // Rate Limit Errors
  if (error.statusCode === 429) {
    return res.status(429).json({
      success: false,
      error: 'Rate Limit überschritten',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: error.retryAfter,
      timestamp: new Date().toISOString()
    });
  }

  // Validation Errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validierungsfehler',
      code: 'VALIDATION_ERROR',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }

  // JWT Errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Ungültiger Token',
      code: 'INVALID_TOKEN',
      timestamp: new Date().toISOString()
    });
  }

  // Database Errors
  if (error.name === 'SequelizeError') {
    return res.status(500).json({
      success: false,
      error: 'Datenbankfehler',
      code: 'DATABASE_ERROR',
      message: config.nodeEnv === 'development' ? error.message : 'Kontaktieren Sie den Administrator',
      timestamp: new Date().toISOString()
    });
  }

  // Generic Error
  res.status(500).json({
    success: false,
    error: 'Interner Serverfehler',
    code: 'INTERNAL_ERROR',
    message: config.nodeEnv === 'development' ? error.message : 'Kontaktieren Sie den Administrator',
    requestId: req.id || 'unknown',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
