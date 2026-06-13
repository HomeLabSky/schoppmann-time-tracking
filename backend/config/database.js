const { Sequelize } = require('sequelize');
const config = require('./index'); // Ihre bestehende config nutzen

// SQLite Datenbank-Konfiguration basierend auf Ihrer config
const sequelize = new Sequelize({
  dialect: config.database.dialect,
  storage: config.database.storage,
  logging: config.database.logging ? console.log : false
});

module.exports = { sequelize };