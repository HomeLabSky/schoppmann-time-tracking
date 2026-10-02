const { Sequelize } = require('sequelize');
const config = require('./index'); // Ihre bestehende config nutzen

// SQLite Datenbank-Konfiguration basierend auf Ihrer config
const sequelize = new Sequelize({
  dialect: config.database.dialect,
  storage: config.database.storage,
  logging: config.database.logging ? console.log : false
});

// SQLite erlaubt nur einen Schreiber gleichzeitig. Ohne Wartezeit scheitern überlappende Schreibvorgänge
// (zwei Anfragen, Backup-Dienst) sofort mit SQLITE_BUSY. Mit Wartezeit reihen sie sich kurz ein.
if (config.database.dialect === 'sqlite') {
  sequelize.addHook('afterConnect', (connection) => {
    connection.configure('busyTimeout', 5000);
  });
}

module.exports = { sequelize };
