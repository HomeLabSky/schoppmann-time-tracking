/**
 * Migrationen: Übernahme bestehender Sequelize-Datenbanken, Prüfregeln (CHECK), Atomarität, Fremdschlüssel-Schutz.
 *
 * Jeder Test arbeitet auf einer eigenen Datei (Verbindung wird dafür neu geöffnet).
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import config from '../src/config';
import { closeDb, getSqlite } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { TimeEntryService } from '../src/services/timeEntryService';

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy-sequelize.sql'), 'utf8');
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'schoppmann-migrate-'));
test.after(() => {
  closeDb();
  fs.rmSync(workdir, { recursive: true, force: true });
});

let counter = 0;
/** Neue Datenbankdatei (optional mit SQL befüllt) und die App-Verbindung darauf umstellen */
const useDatabase = (sql?: string, patch?: (db: Database.Database) => void): string => {
  closeDb();
  const file = path.join(workdir, `db-${++counter}.sqlite`);
  if (sql || patch) {
    const raw = new Database(file);
    if (sql) raw.exec(sql);
    patch?.(raw);
    raw.close();
  }
  config.database.storage = file;
  return file;
};

type Row = Record<string, unknown>;
const all = (sql: string): Row[] => getSqlite().prepare(sql).all() as Row[];
const one = (sql: string): Row => getSqlite().prepare(sql).get() as Row;
const tableSql = (table: string): string =>
  (getSqlite().prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string } | undefined)?.sql ?? '';

/** Inhalte, die eine Übernahme unverändert lassen muss */
const snapshot = () => ({
  users: all('SELECT id, email, password, name, role, isActive, stundenlohn, abrechnungStart, abrechnungEnde, lohnzettelEmail, createdAt FROM Users ORDER BY id'),
  entries: all('SELECT * FROM TimeEntries ORDER BY id'),
  closures: all('SELECT * FROM PeriodClosures ORDER BY id'),
  settings: all('SELECT * FROM MinijobSettings ORDER BY id'),
  audit: all('SELECT * FROM AuditLogs ORDER BY id'),
  sessions: all('SELECT * FROM Sessions ORDER BY id')
});

test('Übernahme: Sequelize-Datenbank wird ohne Datenverlust übernommen, Prüfregeln und Schutz greifen', () => {
  const file = useDatabase(FIXTURE);
  const before = snapshot();
  assert.equal(before.entries.length, 41);

  const result = runMigrations();
  assert.equal(result.adopted, true);
  assert.deepEqual(result.applied, [
    '0001_audit_triggers_and_cleanup', '0002_check_constraints', '0003_multiple_entries_per_day', '0004_time_entry_overlap_triggers',
    '0005_nachtrag_billing_date'
  ]);
  assert.ok(result.backup && fs.existsSync(result.backup), 'Sicherung vor der Migration');
  assert.ok(result.backup?.startsWith(`${file}.pre-migration-`));

  // Kein Datensatz verloren oder verändert – insbesondere keine Zeiteinträge durch ON DELETE CASCADE beim Neuaufbau.
  // Neu ist nur die Spalte billingDate (Nachträge), bei übernommenen Einträgen leer.
  const after = snapshot();
  assert.ok(after.entries.every((e) => e.billingDate === null));
  after.entries.forEach((e) => delete e.billingDate);
  assert.deepEqual(after, before);

  // Prüfregeln sind jetzt Teil der Tabellen
  assert.match(tableSql('Users'), /users_role_check/);
  assert.throws(() => getSqlite().exec("UPDATE Users SET role = 'employee' WHERE id = 1"), /users_role_check/);
  assert.throws(() => getSqlite().exec('UPDATE TimeEntries SET breakMinutes = 999 WHERE id = 1'), /time_entries_break_check/);
  assert.throws(() => getSqlite().exec("UPDATE Sessions SET clientType = 'tv'"), /sessions_client_type_check/);
  assert.throws(() => getSqlite().exec("UPDATE TimeEntries SET startTime = '9 Uhr' WHERE id = 1"), /time_entries_start_check/);

  // Protokoll bleibt unveränderlich, Fremdschlüssel sind wieder aktiv
  assert.throws(() => getSqlite().exec('DELETE FROM AuditLogs'), /unveränderlich/);
  assert.equal(one('PRAGMA foreign_keys').foreign_keys, 1);
  assert.deepEqual(getSqlite().pragma('foreign_key_check'), []);
  assert.equal(one('SELECT COUNT(*) AS n FROM __drizzle_migrations').n, 6);

  // Die Anwendung liest die übernommenen Daten (Zeitpunkte im alten Textformat) korrekt
  const august = TimeEntryService.getMonthlyTimeRecordsSync(2, 2026, 8);
  assert.equal(august.records.length, 20);
  assert.equal(august.period.status, 'closed');
  assert.equal(august.summary.totalEarnings, 1080, 'eingefrorene Zahlen des Abschlusses');
  assert.ok(august.closure?.closedAt instanceof Date && !Number.isNaN(august.closure.closedAt.getTime()));

  // Mehrere Einträge pro Tag: alter eindeutiger Index entfernt, Überschneidungen weist die Datenbank ab
  assert.equal(all("SELECT name FROM sqlite_master WHERE name = 'unique_user_date'").length, 0);
  const first = one('SELECT userId, date, startTime, endTime FROM TimeEntries ORDER BY id LIMIT 1');
  const insert = getSqlite().prepare(
    'INSERT INTO TimeEntries (userId, date, startTime, endTime, breakMinutes, createdAt, updatedAt) ' +
    "VALUES (?, ?, ?, ?, 0, '2026-01-01 00:00:00.000 +00:00', '2026-01-01 00:00:00.000 +00:00')"
  );
  assert.throws(() => insert.run(first.userId, first.date, first.startTime, first.endTime), /time_entries_overlap/);
  insert.run(first.userId, first.date, first.endTime, '23:59:00'); // direkt anschließend: erlaubt
  assert.equal(one(`SELECT COUNT(*) AS n FROM TimeEntries WHERE userId = ${Number(first.userId)} AND date = '${String(first.date)}'`).n, 2);
});

test('Übernahme: zweiter Start ändert nichts mehr', () => {
  useDatabase(FIXTURE);
  runMigrations();
  const before = snapshot();
  const again = runMigrations();
  assert.deepEqual(again, { adopted: false, applied: [], backup: null });
  assert.deepEqual(snapshot(), before);
});

test('Übernahme: sehr alte Datenbank (Phase 0) bekommt fehlende Spalten, Tabellen und den Stundensatz-Snapshot', () => {
  useDatabase(undefined, (db) => {
    db.exec(`
      CREATE TABLE \`Users\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`email\` VARCHAR(255) NOT NULL UNIQUE, \`password\` VARCHAR(255) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL, \`role\` TEXT NOT NULL DEFAULT 'mitarbeiter', \`isActive\` TINYINT(1) DEFAULT 1,
        \`stundenlohn\` DECIMAL(8,2) DEFAULT 12, \`abrechnungStart\` INTEGER NOT NULL DEFAULT 1, \`abrechnungEnde\` INTEGER NOT NULL DEFAULT 31,
        \`lohnzettelEmail\` VARCHAR(255), \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
      CREATE TABLE \`TimeEntries\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`userId\` INTEGER NOT NULL REFERENCES \`Users\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        \`date\` DATE NOT NULL, \`startTime\` TIME NOT NULL, \`endTime\` TIME NOT NULL, \`breakMinutes\` INTEGER NOT NULL DEFAULT 30,
        \`description\` VARCHAR(500), \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
      CREATE UNIQUE INDEX \`unique_user_date\` ON \`TimeEntries\` (\`userId\`, \`date\`);
      CREATE INDEX \`time_entries_user_id\` ON \`TimeEntries\` (\`userId\`);
      INSERT INTO Users (email, password, name, stundenlohn, createdAt, updatedAt)
        VALUES ('alt@schoppmann.de', 'x', 'Alt', 13.5, '2024-01-01 08:00:00.000 +00:00', '2024-01-01 08:00:00.000 +00:00');
      INSERT INTO TimeEntries (userId, date, startTime, endTime, breakMinutes, createdAt, updatedAt)
        VALUES (1, '2024-06-03', '9:00', '17:00', 30, '2024-06-03 18:00:00.000 +00:00', '2024-06-03 18:00:00.000 +00:00');
    `);
  });

  const result = runMigrations();
  assert.equal(result.adopted, true);

  const entry = one('SELECT * FROM TimeEntries');
  assert.equal(entry.hourlyRateCents, 1350, 'Stundensatz aus dem damaligen Stundenlohn eingefroren');
  assert.equal(entry.startTime, '09:00:00', 'altes Zeitformat vereinheitlicht');
  assert.equal(entry.clientId, null);
  for (const table of ['MinijobSettings', 'AuditLogs', 'PeriodClosures', 'Sessions', 'LoginThrottles']) {
    assert.ok(tableSql(table), `Tabelle ${table} angelegt`);
  }
  assert.match(tableSql('Sessions'), /clientType/);
  assert.equal(all("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'time_entries_user_id'").length, 0,
    'überzähliger Alt-Index verschwindet mit dem Neuaufbau');
});

test('Atomar: verletzt ein Altdatensatz eine Prüfregel, bleibt die Datenbank vollständig unverändert', () => {
  const file = useDatabase(FIXTURE, (db) => db.exec("UPDATE Users SET role = 'employee' WHERE id = 3"));
  const schemaBefore = all('SELECT type, name, sql FROM sqlite_master ORDER BY name');
  closeDb();
  const bytesBefore = fs.readFileSync(file);
  config.database.storage = file;

  assert.throws(() => runMigrations(), (error: Error) =>
    /users_role_check/.test(error.message) && /unverändert/.test(error.message));

  assert.deepEqual(all('SELECT type, name, sql FROM sqlite_master ORDER BY name'), schemaBefore, 'Schema unverändert');
  assert.equal(all("SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'").length, 0, 'keine halbe Übernahme');
  assert.equal(one('SELECT COUNT(*) AS n FROM TimeEntries').n, 41);
  closeDb();
  assert.ok(bytesBefore.equals(fs.readFileSync(file)), 'Datei byte-identisch');
});

test('Neue Datenbank: alle Migrationen, Schema mit Prüfregeln', () => {
  useDatabase();
  const result = runMigrations();
  assert.equal(result.adopted, false);
  assert.equal(result.applied.length, 6);
  assert.equal(result.backup, null);
  assert.match(tableSql('TimeEntries'), /time_entries_break_check/);
  // Trigger gehen bei einem Neuaufbau der Tabelle verloren – dieser Test fällt dann auf
  assert.deepEqual(all("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").map((r) => r.name), [
    'auditlogs_no_delete', 'auditlogs_no_update', 'time_entries_no_overlap_insert', 'time_entries_no_overlap_update'
  ]);
});
