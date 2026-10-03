const { Sequelize } = require('sequelize');
const config = require('./index');
const logger = require('../lib/logger');

// SQLite-Datenbank (Pfad absolut, siehe config/index.js)
const sequelize = new Sequelize({
  dialect: config.database.dialect,
  storage: config.database.storage,
  logging: config.database.logging ? (sql) => logger.debug({ sql }, 'SQL') : false
});

// SQLite erlaubt nur einen Schreiber gleichzeitig. Ohne Wartezeit scheitern überlappende Schreibvorgänge
// (zwei Anfragen, Backup-Dienst) sofort mit SQLITE_BUSY. Mit Wartezeit reihen sie sich kurz ein.
if (config.database.dialect === 'sqlite') {
  sequelize.addHook('afterConnect', (connection) => {
    connection.configure('busyTimeout', 5000);
  });
}

module.exports = { sequelize };
