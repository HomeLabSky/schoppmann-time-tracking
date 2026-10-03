/**
 * Server-Einstiegspunkt (Betrieb / Entwicklung).
 *
 * Datenbank-Initialisierung, HTTP-Listener und Prozess-Lifecycle (sauberes Beenden, globale Fehler).
 * Der eigentliche App-Aufbau liegt in app.js.
 */
require('dotenv').config({ quiet: true });
const config = require('./config');
const logger = require('./lib/logger');
const { initDatabase } = require('./models');
const app = require('./app');

const startServer = async () => {
  try {
    await initDatabase();
    app.locals.dbConnected = true;
  } catch (error) {
    // Der Server startet trotzdem: /health meldet 503, der Container-Healthcheck schlägt an
    logger.error({ err: error }, 'Datenbank-Initialisierung fehlgeschlagen');
    app.locals.dbConnected = false;
  }

  const server = app.listen(config.port, () => {
    logger.info({
      port: config.port,
      env: config.nodeEnv,
      database: app.locals.dbConnected ? 'connected' : 'disconnected',
      api: '/api/v1 (Alias /api)',
      openapi: '/api/v1/openapi.json'
    }, 'Server gestartet');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Server wird beendet');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unbehandelte Promise-Ablehnung');
    server.close(() => process.exit(1));
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Unbehandelte Ausnahme');
    server.close(() => process.exit(1));
  });
};

startServer().catch((error) => {
  logger.fatal({ err: error }, 'Server-Start fehlgeschlagen');
  process.exit(1);
});
