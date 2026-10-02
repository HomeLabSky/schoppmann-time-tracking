/**
 * Datenbank-Sicherung und -Wiederherstellung für SQLite.
 *
 * Die Sicherung nutzt `VACUUM INTO`: SQLite schreibt dabei eine in sich konsistente Kopie, auch
 * während das Backend läuft (kein Kopieren einer womöglich halb geschriebenen Datei). Jede Sicherung
 * wird anschließend mit `PRAGMA integrity_check` geprüft; ältere Sicherungen werden rotiert.
 * Die Schutz-Trigger des Änderungsprotokolls sind Teil des Schemas und werden mitgesichert.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const BACKUP_PATTERN = /^timetracking-\d{8}-\d{6}\.db$/;

const openDb = (file, mode) =>
  new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, mode, (error) => (error ? reject(error) : resolve(db)));
  });
const run = (db, sql) =>
  new Promise((resolve, reject) => db.run(sql, (error) => (error ? reject(error) : resolve())));
const all = (db, sql) =>
  new Promise((resolve, reject) => db.all(sql, (error, rows) => (error ? reject(error) : resolve(rows))));
const close = (db) =>
  new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));

const pad = (n) => String(n).padStart(2, '0');
const timestamp = (date = new Date()) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

/** Prüft eine Datenbankdatei auf Integrität und gibt die Zahl der Benutzer zurück. */
const verifyDatabase = async (file) => {
  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${file}`);
  }
  let db;
  try {
    db = await openDb(file, sqlite3.OPEN_READONLY);
    const [{ integrity_check: result }] = await all(db, 'PRAGMA integrity_check');
    if (result !== 'ok') {
      throw new Error(`Integritätsprüfung fehlgeschlagen: ${result}`);
    }
    const tables = (await all(db, "SELECT name FROM sqlite_master WHERE type='table'")).map((t) => t.name);
    if (!tables.includes('Users')) {
      throw new Error('Keine gültige Zeiterfassungs-Datenbank (Tabelle "Users" fehlt)');
    }
    const [{ n }] = await all(db, 'SELECT COUNT(*) AS n FROM Users');
    return { users: n, tables };
  } catch (error) {
    if (/SQLITE_NOTADB|file is not a database/i.test(error.message)) {
      throw new Error('Datei ist keine SQLite-Datenbank (beschädigt?)');
    }
    throw error;
  } finally {
    if (db) await close(db).catch(() => undefined);
  }
};

/** Alte Sicherungen löschen; die neuesten `keep` bleiben erhalten. */
const rotateBackups = (dir, keep) => {
  const files = fs.readdirSync(dir).filter((name) => BACKUP_PATTERN.test(name)).sort(); // Zeitstempel sortiert
  const stale = files.slice(0, Math.max(0, files.length - keep));
  stale.forEach((name) => fs.unlinkSync(path.join(dir, name)));
  return stale;
};

/**
 * Legt eine geprüfte Sicherung an.
 * @param {{source:string, dir:string, keep?:number, now?:Date}} options
 * @returns {Promise<{file:string, bytes:number, users:number, removed:string[]}>}
 */
const createBackup = async ({ source, dir, keep = 30, now = new Date() }) => {
  if (!fs.existsSync(source)) {
    throw new Error(`Datenbank nicht gefunden: ${source}`);
  }
  fs.mkdirSync(dir, { recursive: true });

  const target = path.join(dir, `timetracking-${timestamp(now)}.db`);
  if (fs.existsSync(target)) {
    throw new Error(`Sicherung existiert bereits: ${target}`);
  }

  const db = await openDb(source, sqlite3.OPEN_READONLY);
  try {
    await run(db, `VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    await close(db);
  }

  try {
    const { users } = await verifyDatabase(target);
    const removed = rotateBackups(dir, keep);
    return { file: target, bytes: fs.statSync(target).size, users, removed };
  } catch (error) {
    fs.rmSync(target, { force: true }); // defekte Sicherung nicht liegen lassen
    throw error;
  }
};

/**
 * Stellt eine Sicherung wieder her. Die bisherige Datenbank wird vorher als
 * `<ziel>.vor-wiederherstellung-<zeit>` abgelegt. Das Backend muss dabei gestoppt sein.
 * @param {{backup:string, target:string, now?:Date}} options
 */
const restoreBackup = async ({ backup, target, now = new Date() }) => {
  await verifyDatabase(backup);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Erst in eine Zwischendatei kopieren und prüfen: schlägt etwas fehl, bleibt die vorhandene
  // Datenbank unverändert. Erst danach wird sie ersetzt.
  const staged = `${target}.wiederherstellung-tmp`;
  try {
    fs.copyFileSync(backup, staged);
    const { users } = await verifyDatabase(staged);

    let safetyCopy = null;
    if (fs.existsSync(target)) {
      safetyCopy = `${target}.vor-wiederherstellung-${timestamp(now)}`;
      fs.copyFileSync(target, safetyCopy);
    }
    // Reste eines Journals der alten Datenbank dürfen nicht zur neuen Datei passen
    ['-journal', '-wal', '-shm'].forEach((suffix) => fs.rmSync(`${target}${suffix}`, { force: true }));
    fs.renameSync(staged, target);

    return { target, safetyCopy, users };
  } finally {
    fs.rmSync(staged, { force: true });
  }
};

module.exports = { createBackup, restoreBackup, verifyDatabase, rotateBackups, BACKUP_PATTERN };
