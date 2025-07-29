require('dotenv').config();
const express = require('express');
const config = require('./config'); // ✅ Config importieren

const app = express();

// Basic Middleware
app.use(express.json());

// Development Info
if (config.nodeEnv === 'development') {
  console.log('🔧 ===================================');
  console.log('   DEVELOPMENT CONFIGURATION');
  console.log('🔧 ===================================');
  console.log(`📦 Express: ${require('express/package.json').version}`);
  console.log(`🟢 Node: ${process.version}`);
  console.log(`🔒 Environment: ${config.nodeEnv}`);
  console.log(`📊 Database: ${config.database.dialect}`);
  console.log(`🌐 CORS Origin: ${config.cors.origin.join(', ')}`);
  console.log(`⏱️ Rate Limit: ${config.rateLimit.general} req/15min`);
  console.log('🔧 ===================================');
}

// Health Check mit Config-Details
app.get('/api/health', (req, res) => {
  res.json({ 
    message: '✅ Schoppmann Time Tracking Server läuft!', 
    timestamp: new Date().toISOString(),
    status: 'OK',
    environment: config.nodeEnv,
    version: {
      express: require('express/package.json').version,
      node: process.version
    },
    database: {
      dialect: config.database.dialect,
      connected: true // TODO: Echte DB-Verbindung prüfen
    },
    security: {
      jwtConfigured: !!config.jwt.secret,
      corsOrigins: config.cors.origin.length
    }
  });
});

// Config Test Route (nur Development)
if (config.nodeEnv === 'development') {
  app.get('/api/config', (req, res) => {
    res.json({
      message: '🔧 Development Config (ohne Secrets)',
      config: {
        nodeEnv: config.nodeEnv,
        port: config.port,
        database: {
          dialect: config.database.dialect,
          storage: config.database.storage
        },
        cors: config.cors,
        rateLimit: config.rateLimit,
        jwt: {
          secretLength: config.jwt.secret.length,
          refreshSecretLength: config.jwt.refreshSecret.length,
          expiresIn: config.jwt.expiresIn
        }
      }
    });
  });
}

// Root Route
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Schoppmann Time Tracking API',
    version: '1.0.0',
    environment: config.nodeEnv,
    endpoints: {
      health: '/api/health',
      config: config.nodeEnv === 'development' ? '/api/config' : 'disabled'
    }
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route nicht gefunden',
    path: req.originalUrl,
    available: ['/', '/api/health', '/api/config']
  });
});

// Error Handler
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  res.status(500).json({
    error: 'Interner Serverfehler',
    message: config.nodeEnv === 'development' ? error.message : 'Kontaktieren Sie den Administrator'
  });
});

// Server starten
const server = app.listen(config.port, () => {
  console.log('');
  console.log('🚀 ===================================');
  console.log('   Schoppmann Time Tracking Server');
  console.log('🚀 ===================================');
  console.log(`📡 Server: http://localhost:${config.port}`);
  console.log(`📊 Health: http://localhost:${config.port}/api/health`);
  if (config.nodeEnv === 'development') {
    console.log(`🔧 Config: http://localhost:${config.port}/api/config`);
  }
  console.log(`🔒 Environment: ${config.nodeEnv}`);
  console.log('🚀 ===================================');
  console.log('');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server wird heruntergefahren...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('🛑 Server wird heruntergefahren...');
  server.close(() => process.exit(0));
});