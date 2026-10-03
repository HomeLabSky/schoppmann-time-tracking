/**
 * Versionierte Migrationen (Ordner drizzle/, erzeugt mit `npm run db:generate`) – beim Start automatisch.
 *
 * Ablauf (alles in EINER Transaktion – schlägt ein Schritt fehl, bleibt die Datenbank unverändert):
 * 1. Bestehende Datenbank aus der Sequelize-Zeit (Tabelle Users, aber noch kein Migrationsverlauf): "übernehmen" –
 *    fehlende Spalten, Tabellen und Indizes ergänzen, bis sie der Ausgangsmigration (0000_baseline) entspricht, und
 *    diese als angewendet eintragen.
 * 2. Alle ausstehenden Migrationen anwenden und im Verlauf (__drizzle_migrations, Format von drizzle-orm) eintragen.
 *
 * Sicherheit:
 * - Vor jeder Änderung an einer bestehenden Datei entsteht eine Sicherungskopie (`*.pre-migration-<Zeit>`).
 * - Fremdschlüssel sind während der Migration AUS. SQLite baut Tabellen für neue Prüfregeln neu auf (neue Tabelle,
 *   Daten kopieren, alte löschen). Mit aktiven Fremdschlüsseln würde das Löschen der alten Tabelle `Users` per
 *   ON DELETE CASCADE alle Zeiteinträge mitlöschen. Vor dem Abschluss prüft `PRAGMA foreign_key_check` die
 *   Konsistenz; bei Verstößen wird alles zurückgerollt.
 */
import fs from 'node:fs';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import type Database from 'better-sqlite3';
import config from '../config';
import logger from '../lib/logger';
import { fromBackendRoot } from '../lib/paths';
import { DEFAULT_HOURLY_RATE_CENTS } from '../utils/billing';
import { getSqlite } from './client';

export const MIGRATIONS_FOLDER = fromBackendRoot('drizzle');
const MIGRATIONS_TABLE = '__drizzle_migrations';

const tableExists = (sqlite: Database.Database, table: string): boolean =>
  !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);

const columnNames = (sqlite: Database.Database, table: string): Set<string> =>
  new Set((sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name));

const backupDatabaseFile = (sqlite: Database.Database): string | null => {
  const file = config.database.storage;
  if (file === ':memory:' || !fs.existsSync(file)) return null;
  const target = `${file}.pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  // Konsistente Kopie auch bei offener Verbindung
  sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  logger.info({ backup: target }, 'Sicherung vor Migration angelegt');
  return target;
};

/** Spalten, die in der Sequelize-Zeit nachträglich hinzukamen (ältere Datenbanken haben sie nicht) */
const LEGACY_COLUMNS: [table: string, column: string, definition: string][] = [
  ['TimeEntries', 'hourlyRateCents', 'integer'],
  ['TimeEntries', 'clientId', 'text(64)'],
  ['Sessions', 'clientType', "text(8) DEFAULT 'web' NOT NULL"],
  ['Sessions', 'deviceName', 'text(100)']
];

/** Ausgangsmigration idempotent machen: fehlende Tabellen und Indizes anlegen, vorhandene behalten */
const asIdempotent = (statement: string): string =>
  statement
    .replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE UNIQUE INDEX /, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ');

const ensureMigrationsTable = (sqlite: Database.Database): void => {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`);
};

const markApplied = (sqlite: Database.Database, migration: MigrationMeta): void => {
  sqlite.prepare(`INSERT INTO "${MIGRATIONS_TABLE}" (hash, created_at) VALUES (?, ?)`).run(migration.hash, migration.folderMillis);
};

/** Datenbank aus der Sequelize-Zeit auf den Stand der Ausgangsmigration bringen (innerhalb der Transaktion). */
const adoptLegacyDatabase = (sqlite: Database.Database, baseline: MigrationMeta): void => {
  logger.info('Bestehende Datenbank (Sequelize) wird in die versionierten Migrationen übernommen');
  for (const [table, column, definition] of LEGACY_COLUMNS) {
    if (tableExists(sqlite, table) && !columnNames(sqlite, table).has(column)) {
      sqlite.exec(`ALTER TABLE \`${table}\` ADD \`${column}\` ${definition}`);
      logger.info({ table, column }, 'Übernahme: Spalte ergänzt');
    }
  }
  for (const statement of baseline.sql) {
    const trimmed = statement.trim();
    if (trimmed) sqlite.exec(asIdempotent(trimmed));
  }
  // Stundensatz-Snapshot für Einträge aus der Zeit vor Phase 1
  const filled = sqlite.prepare(
    `UPDATE TimeEntries SET hourlyRateCents = COALESCE(
       (SELECT CAST(ROUND(Users.stundenlohn * 100) AS INTEGER) FROM Users WHERE Users.id = TimeEntries.userId), ?)
     WHERE hourlyRateCents IS NULL`
  ).run(DEFAULT_HOURLY_RATE_CENTS);
  if (filled.changes > 0) logger.info({ count: filled.changes }, 'Übernahme: Zeiteinträge mit Stundensatz versehen');

  ensureMigrationsTable(sqlite);
  markApplied(sqlite, baseline);
};

/** Zeitpunkt der zuletzt angewendeten Migration (Ordnungskriterium wie in drizzle-orm) */
const lastApplied = (sqlite: Database.Database): number | null => {
  if (!tableExists(sqlite, MIGRATIONS_TABLE)) return null;
  const row = sqlite.prepare(`SELECT created_at FROM "${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`).get() as
    | { created_at: number }
    | undefined;
  return row ? Number(row.created_at) : null;
};

export interface MigrationResult {
  adopted: boolean;
  applied: string[];
  backup: string | null;
}

/** Übernahme (falls nötig) und alle ausstehenden Migrationen anwenden. */
export const runMigrations = (): MigrationResult => {
  const sqlite = getSqlite();
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const baseline = migrations[0];
  if (!baseline) throw new Error(`Keine Migrationen in ${MIGRATIONS_FOLDER}`);

  const hasData = tableExists(sqlite, 'Users');
  const adopt = hasData && !tableExists(sqlite, MIGRATIONS_TABLE);
  const last = adopt ? baseline.folderMillis : lastApplied(sqlite);
  const pending = migrations.filter((m) => last === null || m.folderMillis > last);
  if (!adopt && pending.length === 0) return { adopted: false, applied: [], backup: null };

  const backup = hasData ? backupDatabaseFile(sqlite) : null;
  const names = journalNames();

  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.transaction(() => {
      if (adopt) adoptLegacyDatabase(sqlite, baseline);
      ensureMigrationsTable(sqlite);
      for (const migration of pending) {
        for (const statement of migration.sql) {
          const trimmed = statement.trim();
          // PRAGMA foreign_keys wirkt innerhalb einer Transaktion nicht; gesteuert wird es hier außen
          if (trimmed && !/^PRAGMA foreign_keys\s*=/i.test(trimmed)) sqlite.exec(trimmed);
        }
        markApplied(sqlite, migration);
      }
      const violations = sqlite.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new Error(`Fremdschlüssel nach der Migration verletzt: ${JSON.stringify(violations.slice(0, 5))}`);
      }
    })();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = /CHECK constraint failed/.test(message)
      ? ' Bestehende Daten verletzen eine Prüfregel (Name in der Meldung, Regeln: src/db/schema.ts). ' +
        'Die Datenbank ist unverändert; bitte die betroffenen Zeilen korrigieren und neu starten.'
      : ' Die Datenbank ist unverändert.';
    throw new Error(`Migration fehlgeschlagen: ${message}.${hint}`, { cause: error });
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }

  const applied = pending.map((m) => names.get(m.folderMillis) ?? String(m.folderMillis));
  logger.info({ adopted: adopt, applied }, 'Migrationen angewendet');
  return { adopted: adopt, applied, backup };
};

/** Namen der Migrationen aus dem Journal (für Logs und Tests) */
const journalNames = (): Map<number, string> => {
  const journal = JSON.parse(fs.readFileSync(fromBackendRoot('drizzle', 'meta', '_journal.json'), 'utf8')) as {
    entries: { when: number; tag: string }[];
  };
  return new Map(journal.entries.map((e) => [e.when, e.tag]));
};
