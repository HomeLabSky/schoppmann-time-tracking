require('dotenv').config();
const express = require('express');
const config = require('./config');
const { initDatabase } = require('./models');

// ✅ Neue Middleware importieren
const {
  basicSecurity,
  rateLimit, // ✅ Korrigierter Import-Name
  auth,
  validation
} = require('./middleware');

const app = express();

// ✅ Basic Security Middleware (CORS, Helmet, etc.)
app.use(basicSecurity);

// ✅ Body Parser mit Größenlimit
app.use(express.json({ limit: '10mb' }));

// ✅ General Rate Limiting
app.use(rateLimit.general);

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

// ✅ Health Check mit erweiterten Middleware-Infos
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
      storage: config.database.storage,
      connected: dbConnected,
      models: dbConnected ? ['User', 'MinijobSetting'] : []
    },
    security: {
      jwtConfigured: !!config.jwt.secret,
      corsOrigins: config.cors.origin.length,
      helmet: true,
      rateLimiting: true
    },
    middleware: {
      loaded: ['auth', 'validation', 'rateLimit', 'security'],
      version: '2.0.0'
    }
  });
});

// ✅ Auth Test Route (Development only)
if (config.nodeEnv === 'development') {
  app.get('/api/auth-test', auth.token, (req, res) => {
    res.json({
      message: '🔐 Auth Test erfolgreich',
      user: {
        id: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        name: req.user.name
      },
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/admin-test', auth.admin, (req, res) => {
    res.json({
      message: '👑 Admin Test erfolgreich',
      admin: {
        id: req.user.userId,
        email: req.user.email,
        name: req.user.name
      },
      timestamp: new Date().toISOString()
    });
  });
}

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
          storage: config.database.storage,
          connected: dbConnected,
          modelsLoaded: dbConnected
        },
        cors: config.cors,
        rateLimit: config.rateLimit,
        jwt: {
          secretLength: config.jwt.secret.length,
          refreshSecretLength: config.jwt.refreshSecret.length,
          expiresIn: config.jwt.expiresIn
        }
      },
      middleware: {
        auth: 'loaded',
        validation: 'loaded',
        rateLimit: 'active',
        security: 'active'
      }
    });
  });
}

// ✅ Validation Test Route (Development only)
if (config.nodeEnv === 'development') {
  app.post('/api/validation-test', 
    validation.sanitize,
    ...validation.registration,
    (req, res) => {
      res.json({
        message: '✅ Validation Test erfolgreich',
        data: req.body,
        timestamp: new Date().toISOString()
      });
    }
  );
}

// Root Route
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Schoppmann Time Tracking API',
    version: '2.0.0',
    environment: config.nodeEnv,
    database: {
      connected: dbConnected,
      dialect: config.database.dialect,
      models: dbConnected ? ['User', 'MinijobSetting'] : []
    },
    middleware: {
      security: 'active',
      auth: 'ready',
      validation: 'ready',
      rateLimit: 'active'
    },
    endpoints: {
      health: '/api/health',
      config: config.nodeEnv === 'development' ? '/api/config' : 'disabled',
      authTest: config.nodeEnv === 'development' ? '/api/auth-test' : 'disabled',
      adminTest: config.nodeEnv === 'development' ? '/api/admin-test' : 'disabled'
    }
  });
});

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route nicht gefunden',
    path: req.originalUrl,
    method: req.method,
    available: ['/', '/api/health', '/api/config'],
    timestamp: new Date().toISOString()
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

// Server starten mit Datenbank- und Models-Initialisierung
const startServer = async () => {
  // ✅ Datenbank und Models zuerst initialisieren
  await initializeDatabaseAndModels();
  
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
      console.log(`🔐 Auth Test: http://localhost:${config.port}/api/auth-test`);
      console.log(`👑 Admin Test: http://localhost:${config.port}/api/admin-test`);
    }
    console.log(`🔒 Environment: ${config.nodeEnv}`);
    console.log(`📊 Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`📦 Models: ${dbConnected ? '✅ Loaded' : '❌ Not Loaded'}`);
    console.log(`🛡️ Security: ✅ Active (Helmet, CORS, Rate Limiting)`);
    console.log(`🔐 Auth: ✅ Ready`);
    console.log(`✅ Validation: ✅ Active`);
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
};

// ✅ Server mit Datenbank und Models starten
startServer().catch((error) => {
  console.error('❌ Server-Start fehlgeschlagen:', error);
  process.exit(1);
});