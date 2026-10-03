/**
 * Datenbankverbindung: SQLite über better-sqlite3 (synchron, eine Verbindung je Prozess) mit Drizzle.
 *
 * - Synchron heißt: Eine Transaktion (`transaction(() => …)`) läuft ohne Unterbrechung durch andere Anfragen.
 *   Innerhalb einer Transaktion daher nie `await` verwenden (z. B. Passwort-Hashing vorher erledigen).
 * - busy_timeout: Überlappende Schreibvorgänge (Backup-Dienst) warten kurz statt mit SQLITE_BUSY abzubrechen.
 * - foreign_keys: Fremdschlüssel werden geprüft (wie zuvor unter Sequelize).
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import config from '../config';
import logger from '../lib/logger';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

let sqlite: Database.Database | null = null;
let instance: Db | null = null;

const open = (): { sqlite: Database.Database; db: Db } => {
  const file = config.database.storage;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const connection = new Database(file, {
    verbose: config.database.logging ? (message?: unknown) => logger.debug({ sql: message }, 'SQL') : undefined
  });
  connection.pragma('busy_timeout = 5000');
  connection.pragma('foreign_keys = ON');
  return { sqlite: connection, db: drizzle(connection, { schema }) };
};

/** Drizzle-Instanz (Verbindung wird beim ersten Zugriff geöffnet) */
export const getDb = (): Db => {
  if (!instance) ({ sqlite, db: instance } = open());
  return instance;
};

/** Rohe better-sqlite3-Verbindung (Migrationen, Pragmas, Sicherung) */
export const getSqlite = (): Database.Database => {
  getDb();
  return sqlite as Database.Database;
};

/**
 * Führt `fn` in einer Transaktion aus; wirft `fn`, wird alles zurückgerollt.
 * `fn` muss synchron sein (better-sqlite3).
 */
export const transaction = <T>(fn: () => T): T => getDb().transaction(() => fn());

/** Verbindung schließen (Tests, CLI-Skripte, sauberes Beenden) */
export const closeDb = (): void => {
  if (sqlite) sqlite.close();
  sqlite = null;
  instance = null;
};

/** Kurzform für Services: `db().select()…` */
export const db = getDb;
