const { Sequelize } = require('sequelize');
const config = require('./index'); // Ihre bestehende config nutzen

// SQLite Datenbank-Konfiguration basierend auf Ihrer config
const sequelize = new Sequelize({
  dialect: config.database.dialect,
  storage: config.database.storage,
  logging: config.database.logging ? console.log : false
});

// Datenbankverbindung testen
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Datenbankverbindung erfolgreich etabliert');
    console.log(`📊 Database: ${config.database.dialect} (${config.database.storage})`);
  } catch (error) {
    console.error('❌ Datenbankverbindung fehlgeschlagen:', error);
    throw error;
  }
};

module.exports = { 
  sequelize, 
  testConnection 
};