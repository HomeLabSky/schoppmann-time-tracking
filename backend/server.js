/**
 * Server-Einstiegspunkt (Produktion / Entwicklung).
 *
 * Verantwortlich für: Datenbank-/Model-Initialisierung, Start des
 * HTTP-Listeners und Prozess-Lifecycle (Graceful Shutdown, globale
 * Fehler-Handler). Der eigentliche App-Aufbau liegt in app.js.
 */
require('dotenv').config({ quiet: true });
const config = require('./config');
const { initDatabase } = require('./models');
const app = require('./app');

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
const initializeDatabaseAndModels = async () => {
  try {
    await initDatabase();
    app.locals.dbConnected = true;
    console.log('🎉 Datenbank und Models erfolgreich initialisiert');
  } catch (error) {
    console.error('❌ Datenbank/Models-Initialisierung fehlgeschlagen:', error);
    app.locals.dbConnected = false;
  }
};

// ✅ Server starten mit Datenbank- und Models-Initialisierung
const startServer = async () => {
  // Datenbank und Models zuerst initialisieren
  await initializeDatabaseAndModels();

  const dbConnected = app.locals.dbConnected;

  // Server starten
  const server = app.listen(config.port, () => {
    console.log('');
    console.log('🚀 ===================================');
    console.log('   Schoppmann Time Tracking Server');
    console.log('🚀 ===================================');
    console.log(`📡 Server: http://localhost:${config.port}`);
    console.log(`📊 Health: http://localhost:${config.port}/health`);
    console.log(`🔌 API: http://localhost:${config.port}/api/`);
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

    // Erster Admin: npm run admin:create (siehe README)
  });

  // Graceful Shutdown
  const shutdown = () => {
    console.log('🛑 Server wird heruntergefahren...');
    server.close(() => {
      console.log('✅ Server sauber beendet');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Unhandled Promise Rejections
  process.on('unhandledRejection', (reason) => {
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
