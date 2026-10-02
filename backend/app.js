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
require('dotenv').config({ quiet: true });
const express = require('express');
const config = require('./config');

const { basicSecurity, generalLimiter } = require('./middleware');
const apiRoutes = require('./routes');

const app = express();

// Hinter einem Reverse-Proxy muss die echte Client-IP für Rate-Limits ermittelt werden.
if (config.trustProxy !== false) {
  app.set('trust proxy', config.trustProxy);
}

// Wird vom Starter (server.js) nach erfolgreicher DB-Initialisierung gesetzt.
app.locals.dbConnected = false;

// ✅ Basic Security Middleware (CORS, Helmet, etc.)
app.use(basicSecurity);

// ✅ Body Parser mit Größenlimit
app.use(express.json({ limit: '1mb' }));

// ✅ General Rate Limiting
app.use(generalLimiter);

// ✅ API Routes verwenden
app.use('/api', apiRoutes);

// ✅ Root Route (öffentlich, ohne Interna)
app.get('/', (req, res) => {
  res.json({ message: 'Schoppmann Time Tracking Server', status: 'online' });
});

// ✅ Health Check Route (öffentlich, ohne Versions-, Pfad- oder Speicherangaben)
app.get('/health', (req, res) => {
  const dbConnected = req.app.locals.dbConnected;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'OK' : 'DEGRADED',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime())
  });
});

// ✅ 404 Handler für alle anderen Routen
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route nicht gefunden',
    code: 'ROUTE_NOT_FOUND'
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

  // Ungültiges JSON im Request-Body
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Ungültiger Request-Body',
      code: 'INVALID_JSON',
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
