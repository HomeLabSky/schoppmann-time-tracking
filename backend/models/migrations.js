/**
 * Kleine, idempotente Schema-Migrationen für bestehende Datenbanken.
 *
 * `sequelize.sync()` legt nur fehlende Tabellen an, ändert aber keine
 * vorhandenen. Neue Spalten werden deshalb hier nachgezogen. Vor der ersten
 * Änderung entsteht automatisch eine Sicherungskopie der DB-Datei.
 * (Ein vollwertiges Migrations-Framework ist für Phase 2 vorgesehen.)
 */
const fs = require('fs');
const config = require('../config');
const billing = require('../utils/billing');

const backupDatabaseFile = () => {
  const storage = config.database.storage;
  if (config.database.dialect !== 'sqlite' || storage === ':memory:' || !fs.existsSync(storage)) {
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = `${storage}.pre-migration-${stamp}`;
  fs.copyFileSync(storage, target);
  return target;
};

/**
 * Stundensatz pro Zeiteintrag einfrieren (TimeEntries.hourlyRateCents).
 * Bestehende Einträge erhalten den aktuellen Stundenlohn des Mitarbeiters.
 */
const addHourlyRateSnapshot = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable('TimeEntries');

  if (!columns.hourlyRateCents) {
    const backup = backupDatabaseFile();
    if (backup) console.log(`💾 Sicherung vor Migration: ${backup}`);
    await queryInterface.addColumn('TimeEntries', 'hourlyRateCents', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true
    });
    console.log('🔧 Migration: Spalte TimeEntries.hourlyRateCents angelegt');
  }

  const [[{ missing }]] = await sequelize.query(
    'SELECT COUNT(*) AS missing FROM TimeEntries WHERE hourlyRateCents IS NULL'
  );
  if (missing > 0) {
    await sequelize.query(
      `UPDATE TimeEntries
         SET hourlyRateCents = COALESCE(
           (SELECT CAST(ROUND(Users.stundenlohn * 100) AS INTEGER) FROM Users WHERE Users.id = TimeEntries.userId),
           ${billing.DEFAULT_HOURLY_RATE_CENTS})
       WHERE hourlyRateCents IS NULL`
    );
    console.log(`🔧 Migration: ${missing} Zeiteintrag/-einträge mit Stundensatz versehen`);
  }
};

/**
 * Das Änderungsprotokoll ist auch auf Datenbankebene schreibgeschützt: SQLite-Trigger
 * brechen jedes UPDATE und DELETE auf AuditLogs ab (zusätzlich zu den Model-Hooks), auch
 * bei direktem SQL-Zugriff. Für eine gewollte Bereinigung müssen die Trigger bewusst entfernt werden.
 */
const protectAuditLog = async (sequelize) => {
  await sequelize.query(`CREATE TRIGGER IF NOT EXISTS auditlogs_no_update BEFORE UPDATE ON AuditLogs
    BEGIN SELECT RAISE(ABORT, 'AuditLogs sind unveränderlich'); END`);
  await sequelize.query(`CREATE TRIGGER IF NOT EXISTS auditlogs_no_delete BEFORE DELETE ON AuditLogs
    BEGIN SELECT RAISE(ABORT, 'AuditLogs sind unveränderlich'); END`);
};

const runMigrations = async (sequelize) => {
  await addHourlyRateSnapshot(sequelize);
  await protectAuditLog(sequelize);
};

module.exports = { runMigrations };
