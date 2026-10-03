/**
 * Tests für Datenbank-Sicherung und -Wiederherstellung (echte SQLite-Dateien in einem Temp-Ordner).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

import { BACKUP_PATTERN, createBackup, restoreBackup, verifyDatabase } from '../src/utils/dbBackup';

/** SQL auf einer Datei ausführen (Testaufbau) */
const execFile = (file: string, sql: string): void => {
  const db = new Database(file);
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testabfragen
const query = async (file: string, sql: string): Promise<any[]> => {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
};

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'schoppmann-backup-'));
test.after(() => fs.rmSync(workdir, { recursive: true, force: true }));

/** Minimal-Datenbank mit Benutzern und dem Schutz-Trigger des Änderungsprotokolls. */
const makeDb = async (name: string, users = 2): Promise<string> => {
  const file = path.join(workdir, name);
  execFile(file, `
    CREATE TABLE Users (id INTEGER PRIMARY KEY, email TEXT);
    CREATE TABLE AuditLogs (id INTEGER PRIMARY KEY, action TEXT);
    CREATE TRIGGER auditlogs_no_delete BEFORE DELETE ON AuditLogs BEGIN SELECT RAISE(ABORT, 'unveränderlich'); END;
    ${Array.from({ length: users }, (_, i) => `INSERT INTO Users (email) VALUES ('u${i}@x.de');`).join('\n')}
    INSERT INTO AuditLogs (action) VALUES ('test');
  `);
  return file;
};

test('Sicherung: konsistente Kopie mit Inhalt, Zeitstempel-Name und bestandener Integritätsprüfung', async () => {
  const source = await makeDb('source1.db', 3);
  const dir = path.join(workdir, 'b1');
  const result = await createBackup({ source, dir, now: new Date(2026, 9, 2, 3, 15, 0) });

  assert.equal(path.basename(result.file), 'timetracking-20261002-031500.db');
  assert.ok(BACKUP_PATTERN.test(path.basename(result.file)));
  assert.equal(result.users, 3);
  assert.deepEqual(await query(result.file, 'SELECT COUNT(*) AS n FROM Users'), [{ n: 3 }]);
});

test('Sicherung: Schutz-Trigger des Änderungsprotokolls wird mitgesichert', async () => {
  const source = await makeDb('source2.db');
  const { file } = await createBackup({ source, dir: path.join(workdir, 'b2') });
  const triggers = await query(file, "SELECT name FROM sqlite_master WHERE type='trigger'");
  assert.deepEqual(triggers.map((t) => t.name), ['auditlogs_no_delete']);
});

test('Sicherung: Quelle bleibt unverändert und nutzbar', async () => {
  const source = await makeDb('source3.db');
  const before = fs.readFileSync(source);
  await createBackup({ source, dir: path.join(workdir, 'b3') });
  assert.ok(before.equals(fs.readFileSync(source)), 'Quelldatei byte-identisch');
});

test('Rotation: nur die neuesten N Sicherungen bleiben, fremde Dateien werden nie gelöscht', async () => {
  const source = await makeDb('source4.db');
  const dir = path.join(workdir, 'b4');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notizen.txt'), 'bleibt');

  const base = new Date(2026, 0, 1, 12, 0, 0);
  for (let i = 0; i < 5; i++) {
    await createBackup({ source, dir, keep: 3, now: new Date(base.getTime() + i * 86400000) });
  }
  const files = fs.readdirSync(dir).filter((f) => BACKUP_PATTERN.test(f));
  assert.deepEqual(files, ['timetracking-20260103-120000.db', 'timetracking-20260104-120000.db', 'timetracking-20260105-120000.db']);
  assert.ok(fs.existsSync(path.join(dir, 'notizen.txt')));
});

test('Sicherung: fehlende Datenbank oder keine SQLite-Datei werden abgelehnt', async () => {
  const dir = path.join(workdir, 'b5');
  await assert.rejects(() => createBackup({ source: path.join(workdir, 'gibtsnicht.db'), dir }), /nicht gefunden/);

  const junk = path.join(workdir, 'kaputt.db');
  fs.writeFileSync(junk, 'das ist keine datenbank, sondern nur text '.repeat(50));
  await assert.rejects(() => createBackup({ source: junk, dir }));
  const left = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => BACKUP_PATTERN.test(f)) : [];
  assert.equal(left.length, 0, 'keine defekte Sicherung bleibt liegen');
});

test('Wiederherstellung: ersetzt die Datenbank, legt eine Kopie der alten an', async () => {
  const good = await makeDb('good.db', 2);
  const { file: backup } = await createBackup({ source: good, dir: path.join(workdir, 'b6') });

  const target = await makeDb('live.db', 7); // "kaputter" aktueller Stand mit anderem Inhalt
  const result = await restoreBackup({ backup, target, now: new Date(2026, 9, 2, 4, 0, 0) });

  assert.equal(result.users, 2);
  assert.deepEqual(await query(target, 'SELECT COUNT(*) AS n FROM Users'), [{ n: 2 }]);
  assert.match(path.basename(result.safetyCopy ?? ''), /^live\.db\.vor-wiederherstellung-20261002-040000$/);
  assert.deepEqual(await query(result.safetyCopy ?? '', 'SELECT COUNT(*) AS n FROM Users'), [{ n: 7 }]);
  assert.ok(!fs.existsSync(`${target}.wiederherstellung-tmp`), 'keine Zwischendatei übrig');
});

test('Wiederherstellung: defekte Sicherung wird abgelehnt, vorhandene Datenbank bleibt unverändert', async () => {
  const target = await makeDb('live2.db', 4);
  const before = fs.readFileSync(target);

  const junk = path.join(workdir, 'junk-backup.db');
  fs.writeFileSync(junk, 'kein sqlite '.repeat(200));
  await assert.rejects(() => restoreBackup({ backup: junk, target }), /keine SQLite-Datenbank|Integrität/);
  await assert.rejects(() => restoreBackup({ backup: path.join(workdir, 'weg.db'), target }), /nicht gefunden/);

  assert.ok(before.equals(fs.readFileSync(target)), 'Datenbank byte-identisch');
  assert.deepEqual(fs.readdirSync(workdir).filter((f) => f.startsWith('live2.db.')), [], 'keine Reste');
});

test('Wiederherstellung: Datei ohne Users-Tabelle wird abgelehnt', async () => {
  const other = path.join(workdir, 'fremd.db');
  execFile(other, 'CREATE TABLE Etwas (id INTEGER);');
  await assert.rejects(() => verifyDatabase(other), /Users/);
});
