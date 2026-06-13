const { sequelize } = require('../config/database');
const User = require('./User');
const MinijobSetting = require('./MinijobSetting');
const TimeEntry = require('./TimeEntry'); // ✅ TimeEntry importieren

// ✅ Beziehungen zwischen Models definieren
User.hasMany(MinijobSetting, {
  foreignKey: 'createdBy',
  as: 'CreatedMinijobSettings'
});

MinijobSetting.belongsTo(User, {
  foreignKey: 'createdBy',
  as: 'Creator'
});

// TimeEntry Beziehungen
User.hasMany(TimeEntry, {
  foreignKey: 'userId',
  as: 'TimeEntries'
});

TimeEntry.belongsTo(User, {
  foreignKey: 'userId',
  as: 'User'
});

// ✅ Datenbank initialisieren (ersetzt die alte database.js Funktion)
const initDatabase = async () => {
  try {
    console.log('🔄 Initialisiere Datenbank...');

    // Verbindung testen
    await sequelize.authenticate();
    console.log('✅ Datenbankverbindung erfolgreich etabliert');

    // Tabellen synchronisieren
    await sequelize.sync();
    console.log('✅ Datenbank-Tabellen synchronisiert');

    // Aktive Minijob-Einstellungen beim Start aktualisieren
    try {
      await MinijobSetting.updateActiveStatus();
      console.log('✅ Minijob-Einstellungen Status aktualisiert');
    } catch (error) {
      console.warn('⚠️ Minijob-Status Update übersprungen (evtl. erste Initialisierung)');
    }

    console.log('🎉 Datenbank erfolgreich initialisiert');
    return true;
  } catch (error) {
    console.error('❌ Datenbankfehler:', error);
    throw error;
  }
};

// ✅ Alle Models und Funktionen exportieren
module.exports = {
  // Models
  User,
  MinijobSetting,
  TimeEntry, // ✅ HINZUGEFÜGT: TimeEntry exportieren

  // Database
  sequelize,
  initDatabase
};