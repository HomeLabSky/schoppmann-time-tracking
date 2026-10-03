/**
 * Kleine, idempotente Schema-Migrationen für bestehende Datenbanken.
 *
 * `sequelize.sync()` legt nur fehlende Tabellen und Indizes an, ändert aber keine vorhandenen Spalten.
 * - runPreSyncMigrations: neue Spalten in bestehenden Tabellen – VOR sync(), weil sync() sonst Indizes
 *   auf noch fehlende Spalten anlegen will.
 * - runMigrations: Datenpflege und Trigger NACH sync().
 * Vor der ersten Änderung entsteht automatisch eine Sicherungskopie der DB-Datei.
 * (Versionierte Migrationen mit Drizzle folgen mit dem Wechsel auf better-sqlite3.)
 */
const fs = require('fs');
const config = require('../config');
const billing = require('../utils/billing');
const logger = require('../lib/logger');

let backupTaken = false;
const backupDatabaseFile = () => {
  const storage = config.database.storage;
  if (backupTaken || config.database.dialect !== 'sqlite' || storage === ':memory:' || !fs.existsSync(storage)) {
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = `${storage}.pre-migration-${stamp}`;
  fs.copyFileSync(storage, target);
  backupTaken = true;
  logger.info({ backup: target }, 'Sicherung vor Migration angelegt');
  return target;
};

const tableExists = async (queryInterface, table) => {
  const tables = await queryInterface.showAllTables();
  return tables.includes(table);
};

/** Fügt eine Spalte hinzu, wenn die Tabelle existiert und die Spalte fehlt. */
const addColumnIfMissing = async (sequelize, table, column, definition) => {
  const queryInterface = sequelize.getQueryInterface();
  if (!(await tableExists(queryInterface, table))) return false;
  const columns = await queryInterface.describeTable(table);
  if (columns[column]) return false;
  backupDatabaseFile();
  await queryInterface.addColumn(table, column, definition);
  logger.info({ table, column }, 'Migration: Spalte angelegt');
  return true;
};

const runPreSyncMigrations = async (sequelize) => {
  const { STRING, INTEGER } = sequelize.Sequelize;
  // Phase 1: Stundensatz pro Zeiteintrag einfrieren
  await addColumnIfMissing(sequelize, 'TimeEntries', 'hourlyRateCents', { type: INTEGER, allowNull: true });
  // Phase 2: idempotente Anlage (App/Offline) und Sitzungen für die App
  await addColumnIfMissing(sequelize, 'TimeEntries', 'clientId', { type: STRING(64), allowNull: true });
  await addColumnIfMissing(sequelize, 'Sessions', 'clientType', { type: STRING(8), allowNull: false, defaultValue: 'web' });
  await addColumnIfMissing(sequelize, 'Sessions', 'deviceName', { type: STRING(100), allowNull: true });
};

/** Bestandseinträge ohne eingefrorenen Stundensatz erhalten den aktuellen Stundenlohn des Mitarbeiters. */
const fillHourlyRateSnapshot = async (sequelize) => {
  const [[{ missing }]] = await sequelize.query(
    'SELECT COUNT(*) AS missing FROM TimeEntries WHERE hourlyRateCents IS NULL'
  );
  if (missing > 0) {
    backupDatabaseFile();
    await sequelize.query(
      `UPDATE TimeEntries
         SET hourlyRateCents = COALESCE(
           (SELECT CAST(ROUND(Users.stundenlohn * 100) AS INTEGER) FROM Users WHERE Users.id = TimeEntries.userId),
           ${billing.DEFAULT_HOURLY_RATE_CENTS})
       WHERE hourlyRateCents IS NULL`
    );
    logger.info({ count: missing }, 'Migration: Zeiteinträge mit Stundensatz versehen');
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
  await fillHourlyRateSnapshot(sequelize);
  await protectAuditLog(sequelize);
};

module.exports = { runPreSyncMigrations, runMigrations };
