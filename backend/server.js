require('dotenv').config();
const express = require('express');
const config = require('./config');
const { initDatabase } = require('./models');

// ✅ Middleware importieren (KORRIGIERT)
const {
  basicSecurity,
  generalLimiter
} = require('./middleware');

// ✅ API Routes importieren
const apiRoutes = require('./routes');

const app = express();

// ✅ Basic Security Middleware (CORS, Helmet, etc.)
app.use(basicSecurity);

// ✅ Body Parser mit Größenlimit
app.use(express.json({ limit: '10mb' }));

// ✅ General Rate Limiting
app.use(generalLimiter);

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

// ✅ Datenbank und Models initialisieren
let dbConnected = false;
const initializeDatabaseAndModels = async () => {
  try {
    await initDatabase();
    dbConnected = true;
    console.log('🎉 Datenbank und Models erfolgreich initialisiert');
  } catch (error) {
    console.error('❌ Datenbank/Models-Initialisierung fehlgeschlagen:', error);
    dbConnected = false;
  }
};

// ✅ API Routes verwenden
app.use('/api', apiRoutes);

// ✅ Root Route
app.get('/', (req, res) => {
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

// ✅ Verbesserter Error Handler
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

// ✅ Server starten mit Datenbank- und Models-Initialisierung
const startServer = async () => {
  // Datenbank und Models zuerst initialisieren
  await initializeDatabaseAndModels();
  
  // Server starten
  const server = app.listen(config.port, () => {
    console.log('');
    console.log('🚀 ===================================');
    console.log('   Schoppmann Time Tracking Server');
    console.log('🚀 ===================================');
    console.log(`📡 Server: http://localhost:${config.port}`);
    console.log(`📊 Health: http://localhost:${config.port}/health`);
    console.log(`🔌 API: http://localhost:${config.port}/api/`);
    if (config.nodeEnv === 'development') {
      console.log(`🔧 API Routes: http://localhost:${config.port}/api/dev/routes`);
      console.log(`🔧 Middleware: http://localhost:${config.port}/api/dev/middleware`);
    }
    console.log(`🔒 Environment: ${config.nodeEnv}`);
    console.log(`📊 Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`📦 Models: ${dbConnected ? '✅ Loaded (User, MinijobSetting)' : '❌ Not Loaded'}`);
    console.log(`🛡️ Security: ✅ Active (Helmet, CORS, Rate Limiting)`);
    console.log(`🔐 Auth: ✅ JWT Ready`);
    console.log(`✅ Validation: ✅ express-validator Active`);
    console.log(`📍 API Endpoints:`);
    console.log(`   • Auth: /api/auth/*`);
    console.log(`   • Employee: /api/employee/*`);
    console.log(`   • Admin: /api/admin/*`);
    console.log(`   • Minijob: /api/admin/minijob/*`);
    console.log('🚀 ===================================');
    console.log('');
    
    // Erste Admin-Erstellung Hinweis
    if (config.nodeEnv === 'development') {
      console.log('💡 TIPP: Ersten Admin erstellen mit:');
      console.log(`   GET http://localhost:${config.port}/api/admin/create-first-admin`);
      console.log('');
    }
  });

  // Graceful Shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Server wird heruntergefahren...');
    server.close(() => {
      console.log('✅ Server sauber beendet');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 Server wird heruntergefahren...');
    server.close(() => {
      console.log('✅ Server sauber beendet');
      process.exit(0);
    });
  });

  // Unhandled Promise Rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
    server.close(() => process.exit(1));
  });

  // Uncaught Exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    server.close(() => process.exit(1));
  });
};

// ✅ Server mit Datenbank und Models starten
startServer().catch((error) => {
  console.error('❌ Server-Start fehlgeschlagen:', error);
  process.exit(1);
});