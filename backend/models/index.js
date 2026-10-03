const { sequelize } = require('../config/database');
const User = require('./User');
const MinijobSetting = require('./MinijobSetting');
const TimeEntry = require('./TimeEntry'); // TimeEntry importieren
const AuditLog = require('./AuditLog');
const PeriodClosure = require('./PeriodClosure');
const Session = require('./Session');
const LoginThrottle = require('./LoginThrottle');
const { runPreSyncMigrations, runMigrations } = require('./migrations');
const logger = require('../lib/logger');

// Beziehungen zwischen Models definieren
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

// Monatsabschluss
User.hasMany(PeriodClosure, { foreignKey: 'userId', as: 'PeriodClosures' });
PeriodClosure.belongsTo(User, { foreignKey: 'userId', as: 'User' });

// Anmelde-Sitzungen (werden mit dem Benutzer gelöscht)
User.hasMany(Session, { foreignKey: 'userId', as: 'Sessions', onDelete: 'CASCADE' });
Session.belongsTo(User, { foreignKey: 'userId', as: 'User' });

// Datenbank initialisieren: Verbindung, Schema, Migrationen
const initDatabase = async () => {
  await sequelize.authenticate();
  // Neue Spalten in bestehenden Tabellen zuerst – sync() legt danach fehlende Tabellen und Indizes an
  await runPreSyncMigrations(sequelize);
  await sequelize.sync();
  await runMigrations(sequelize);

  // Aktive Minijob-Einstellung beim Start aktualisieren
  await MinijobSetting.updateActiveStatus();
  logger.info('Datenbank initialisiert');
  return true;
};

// Alle Models und Funktionen exportieren
module.exports = {
  // Models
  User,
  MinijobSetting,
  TimeEntry,
  AuditLog,
  PeriodClosure,
  Session,
  LoginThrottle,

  // Database
  sequelize,
  initDatabase
};