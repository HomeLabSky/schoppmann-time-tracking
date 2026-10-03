/**
 * Datenbank-Sicherung und -Wiederherstellung für SQLite.
 *
 * Die Sicherung nutzt `VACUUM INTO`: SQLite schreibt dabei eine in sich konsistente Kopie, auch
 * während das Backend läuft (kein Kopieren einer womöglich halb geschriebenen Datei). Jede Sicherung
 * wird anschließend mit `PRAGMA integrity_check` geprüft; ältere Sicherungen werden rotiert.
 * Die Schutz-Trigger des Änderungsprotokolls sind Teil des Schemas und werden mitgesichert.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export const BACKUP_PATTERN = /^timetracking-\d{8}-\d{6}\.db$/;

const openReadonly = (file: string) => new Database(file, { readonly: true, fileMustExist: true });

const pad = (n: number) => String(n).padStart(2, '0');
const timestamp = (date = new Date()) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

/** Prüft eine Datenbankdatei auf Integrität und gibt die Zahl der Benutzer zurück. */
export const verifyDatabase = async (file: string): Promise<{ users: number; tables: string[] }> => {
  if (!fs.existsSync(file)) {
    throw new Error(`Datei nicht gefunden: ${file}`);
  }
  let db: Database.Database | undefined;
  try {
    db = openReadonly(file);
    const result = db.pragma('integrity_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(`Integritätsprüfung fehlgeschlagen: ${String(result)}`);
    }
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    if (!tables.includes('Users')) {
      throw new Error('Keine gültige Zeiterfassungs-Datenbank (Tabelle "Users" fehlt)');
    }
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM Users').get() as { n: number };
    return { users: n, tables };
  } catch (error) {
    if (error instanceof Error && /SQLITE_NOTADB|file is not a database/i.test(`${(error as { code?: string }).code} ${error.message}`)) {
      throw new Error('Datei ist keine SQLite-Datenbank (beschädigt?)');
    }
    throw error;
  } finally {
    db?.close();
  }
};

/** Alte Sicherungen löschen; die neuesten `keep` bleiben erhalten. */
export const rotateBackups = (dir: string, keep: number): string[] => {
  const files = fs.readdirSync(dir).filter((name) => BACKUP_PATTERN.test(name)).sort(); // Zeitstempel sortiert
  const stale = files.slice(0, Math.max(0, files.length - keep));
  stale.forEach((name) => fs.unlinkSync(path.join(dir, name)));
  return stale;
};

/**
 * Legt eine geprüfte Sicherung an.
 */
export const createBackup = async (
  { source, dir, keep = 30, now = new Date() }: { source: string; dir: string; keep?: number; now?: Date }
): Promise<{ file: string; bytes: number; users: number; removed: string[] }> => {
  if (!fs.existsSync(source)) {
    throw new Error(`Datenbank nicht gefunden: ${source}`);
  }
  fs.mkdirSync(dir, { recursive: true });

  const target = path.join(dir, `timetracking-${timestamp(now)}.db`);
  if (fs.existsSync(target)) {
    throw new Error(`Sicherung existiert bereits: ${target}`);
  }

  const db = openReadonly(source);
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
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
 */
export const restoreBackup = async (
  { backup, target, now = new Date() }: { backup: string; target: string; now?: Date }
): Promise<{ target: string; safetyCopy: string | null; users: number }> => {
  await verifyDatabase(backup);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Erst in eine Zwischendatei kopieren und prüfen: schlägt etwas fehl, bleibt die vorhandene
  // Datenbank unverändert. Erst danach wird sie ersetzt.
  const staged = `${target}.wiederherstellung-tmp`;
  try {
    fs.copyFileSync(backup, staged);
    const { users } = await verifyDatabase(staged);

    let safetyCopy: string | null = null;
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

/** Name der Markierungsdatei, die auf dem NAS-Ordner liegen muss (siehe copyToOffsite). */
export const OFFSITE_MARKER = '.zeiterfassung-offsite';

/**
 * Kopiert eine fertige Sicherung in eine externe Ablage (z. B. ein auf dem Server eingebundenes NAS).
 *
 * Schutz vor dem klassischen Fehler "NAS ist gar nicht eingebunden": Ein nicht eingebundener Ordner
 * ist nur ein leerer lokaler Ordner – die Kopie würde unbemerkt auf der lokalen Platte landen.
 * Deshalb muss im Zielordner eine Markierungsdatei (.zeiterfassung-offsite) liegen, die man einmalig
 * auf dem NAS anlegt. Fehlt sie, wird nicht kopiert und ein Fehler gemeldet.
 *
 * Die Kopie wird in eine Zwischendatei geschrieben, auf Integrität geprüft und erst dann umbenannt.
 */
export const copyToOffsite = async (
  { file, dir, keep = 90 }: { file: string; dir: string; keep?: number }
): Promise<{ file: string; removed: string[] }> => {
  if (!fs.existsSync(dir)) {
    throw new Error(`NAS-Ordner nicht gefunden: ${dir}`);
  }
  if (!fs.existsSync(path.join(dir, OFFSITE_MARKER))) {
    throw new Error(
      `NAS nicht eingebunden oder falscher Ordner: die Markierungsdatei ${OFFSITE_MARKER} fehlt in ${dir}`
    );
  }

  const target = path.join(dir, path.basename(file));
  const partial = `${target}.partial`;
  try {
    fs.copyFileSync(file, partial);
    await verifyDatabase(partial);
    fs.renameSync(partial, target);
  } finally {
    fs.rmSync(partial, { force: true });
  }
  return { file: target, removed: rotateBackups(dir, keep) };
};

