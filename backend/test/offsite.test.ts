/**
 * Tests für NAS-Ablage, Sicherungsstatus und Zeitplan.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

import { BACKUP_PATTERN, copyToOffsite, createBackup, OFFSITE_MARKER } from '../src/utils/dbBackup';
import { evaluateBackupStatus, readStatus, recordRun, STATUS_FILE, type BackupStatusFile } from '../src/utils/backupStatus';
import { msUntilNext } from '../src/utils/schedule';

// Skripte direkt aus dem Quelltext starten (wie npm run … in der Entwicklung)
const SCRIPTS = path.join(__dirname, '..', 'src', 'scripts');
const runScript = (name: string, env: Record<string, string>) =>
  spawnSync(process.execPath, ['--import', 'tsx', path.join(SCRIPTS, `${name}.ts`)], { env: { ...process.env, ...env }, encoding: 'utf8' });

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'schoppmann-offsite-'));
test.after(() => fs.rmSync(workdir, { recursive: true, force: true }));

const makeDb = async (name: string): Promise<string> => {
  const file = path.join(workdir, name);
  const db = new Database(file);
  db.exec("CREATE TABLE Users (id INTEGER PRIMARY KEY, email TEXT); INSERT INTO Users (email) VALUES ('a@b.de');");
  db.close();
  return file;
};

const makeNas = (name, { marker = true } = {}) => {
  const dir = path.join(workdir, name);
  fs.mkdirSync(dir, { recursive: true });
  if (marker) fs.writeFileSync(path.join(dir, OFFSITE_MARKER), '');
  return dir;
};

// ---------- NAS-Kopie ----------

test('NAS: Kopie mit Markierungsdatei wird geprüft abgelegt, ohne Zwischendatei', async () => {
  const source = await makeDb('s1.db');
  const { file } = await createBackup({ source, dir: path.join(workdir, 'l1') });
  const nas = makeNas('nas1');

  const result = await copyToOffsite({ file, dir: nas });
  assert.equal(path.basename(result.file), path.basename(file));
  assert.ok(fs.existsSync(result.file));
  assert.deepEqual(fs.readdirSync(nas).filter((f) => f.endsWith('.partial')), []);
});

test('NAS: ohne Markierungsdatei wird NICHT kopiert (Schutz vor nicht eingebundenem NAS)', async () => {
  const source = await makeDb('s2.db');
  const { file } = await createBackup({ source, dir: path.join(workdir, 'l2') });
  const unmounted = makeNas('nas-leer', { marker: false });

  await assert.rejects(() => copyToOffsite({ file, dir: unmounted }), /Markierungsdatei .zeiterfassung-offsite fehlt/);
  assert.deepEqual(fs.readdirSync(unmounted), [], 'nichts wurde in den lokalen Ersatzordner geschrieben');
  await assert.rejects(() => copyToOffsite({ file, dir: path.join(workdir, 'gibt-es-nicht') }), /nicht gefunden/);
});

test('NAS: eigene Aufbewahrung, Markierung und fremde Dateien bleiben', async () => {
  const source = await makeDb('s3.db');
  const nas = makeNas('nas3');
  fs.writeFileSync(path.join(nas, 'urlaubsfotos.zip'), 'bleibt');

  for (let i = 0; i < 5; i++) {
    const { file } = await createBackup({ source, dir: path.join(workdir, 'l3'), keep: 10, now: new Date(2026, 0, 1 + i, 3, 0, 0) });
    await copyToOffsite({ file, dir: nas, keep: 2 });
  }
  const backups = fs.readdirSync(nas).filter((f) => BACKUP_PATTERN.test(f));
  assert.deepEqual(backups, ['timetracking-20260104-030000.db', 'timetracking-20260105-030000.db']);
  assert.ok(fs.existsSync(path.join(nas, 'urlaubsfotos.zip')));
  assert.ok(fs.existsSync(path.join(nas, OFFSITE_MARKER)));
});

test('NAS: beschädigte Sicherung wird nicht abgelegt', async () => {
  const nas = makeNas('nas4');
  const junk = path.join(workdir, 'timetracking-20260101-000000.db');
  fs.writeFileSync(junk, 'kein sqlite '.repeat(300));
  await assert.rejects(() => copyToOffsite({ file: junk, dir: nas }));
  assert.deepEqual(fs.readdirSync(nas).filter((f) => f !== OFFSITE_MARKER), []);
});

// ---------- Status ----------

const H = 3600000;
const now = new Date('2026-10-02T12:00:00Z');
const ago = (hours) => new Date(now.getTime() - hours * H).toISOString();
interface StatusInput {
  local?: number | null;
  offsite?: number | null;
  configured?: boolean;
  offsiteOk?: boolean;
  error?: string | null;
  localError?: string | null;
}
const status = ({ local = 5, offsite = 5, configured = true, offsiteOk = true, error = null, localError = null }: StatusInput = {}) => ({
  lastAttemptAt: now.toISOString(),
  local: { ok: localError === null, lastSuccessAt: local === null ? null : ago(local), file: null, bytes: null, error: localError },
  offsite: { configured, ok: configured ? offsiteOk : null, lastSuccessAt: offsite === null ? null : ago(offsite), error, keep: null }
}) as BackupStatusFile;

test('Status: Bewertung', () => {
  const cases: [string, BackupStatusFile | null, string][] = [
    ['keine Statusdatei', null, 'unknown'],
    ['alles frisch', status(), 'ok'],
    ['lokal zu alt', status({ local: 40, offsite: 40 }), 'error'],
    ['noch nie erfolgreich', status({ local: null, localError: 'Platte voll' }), 'error'],
    ['kein NAS eingerichtet', status({ configured: false, offsite: null }), 'warning'],
    ['NAS noch nie erfolgreich', status({ offsite: null, offsiteOk: false, error: 'NAS nicht eingebunden' }), 'error'],
    ['NAS veraltet (> 36 h)', status({ offsite: 50, offsiteOk: false, error: 'Zeitüberschreitung' }), 'error'],
    ['letzter NAS-Lauf fehlgeschlagen, davor frisch', status({ offsite: 20, offsiteOk: false, error: 'kurz weg' }), 'warning'],
  ];
  for (const [name, input, expected] of cases) {
    assert.equal(evaluateBackupStatus(input, now).state, expected, name);
  }
  assert.match(evaluateBackupStatus(status({ offsite: null, offsiteOk: false, error: 'NAS nicht eingebunden' }), now).message, /NAS nicht eingebunden/);
  assert.equal(evaluateBackupStatus(status({ local: 30 }), now).localAgeHours, 30);
});

test('Status: recordRun behält den letzten Erfolg, wenn ein Lauf fehlschlägt', () => {
  const dir = path.join(workdir, 'st1');
  const t1 = new Date('2026-10-01T02:30:00Z');
  const t2 = new Date('2026-10-02T02:30:00Z');

  recordRun(dir, { now: t1, local: { ok: true, file: 'a.db', bytes: 10 }, offsite: { configured: true, ok: true } });
  const after = recordRun(dir, { now: t2, local: { ok: true, file: 'b.db', bytes: 12 }, offsite: { configured: true, ok: false, error: 'NAS weg' } });

  assert.equal(after.local.lastSuccessAt, t2.toISOString());
  assert.equal(after.offsite.lastSuccessAt, t1.toISOString(), 'letzter NAS-Erfolg bleibt erhalten');
  assert.equal(after.offsite.error, 'NAS weg');
  assert.deepEqual(readStatus(dir), after);

  // Auch ein lokaler Fehler darf den Zeitpunkt des letzten Erfolgs nicht überschreiben
  const t3 = new Date('2026-10-03T02:30:00Z');
  const failed = recordRun(dir, { now: t3, local: { ok: false, error: 'Platte voll' }, offsite: { configured: true, ok: false, error: 'übersprungen' } });
  assert.equal(failed.local.ok, false);
  assert.equal(failed.local.lastSuccessAt, t2.toISOString());
  assert.equal(failed.local.file, 'b.db');
  assert.equal(failed.local.error, 'Platte voll');
  assert.ok(!fs.existsSync(path.join(dir, `${STATUS_FILE}.tmp`)));
});

// ---------- Zeitplan ----------

test('Zeitplan: nächste Ausführung heute oder morgen', () => {
  const at = (h, m) => new Date(2026, 9, 2, h, m, 0, 0);
  assert.equal(msUntilNext(at(1, 0), '02:30'), 90 * 60000, 'heute 02:30');
  assert.equal(msUntilNext(at(2, 30), '02:30'), 24 * H, 'genau jetzt → morgen');
  assert.equal(msUntilNext(at(14, 0), '02:30'), 12.5 * H, 'nach 02:30 → morgen früh');
  assert.equal(msUntilNext(at(0, 0), '0:05'), 5 * 60000, 'einstellige Stunde erlaubt');
  for (const bad of ['', '25:00', '02:60', 'abc', '2.30']) {
    assert.throws(() => msUntilNext(new Date(), bad), /Ungültige Uhrzeit/, bad);
  }
});

// ---------- Skript (wie im Container) ----------

const runBackupScript = (env: Record<string, string>) => runScript('backup-db', env);

test('Skript: Sicherung + NAS-Kopie → Exit 0 und Status ok', async () => {
  const db = await makeDb('cli1.db');
  const backups = path.join(workdir, 'cli1-backups');
  const nas = makeNas('cli1-nas');

  const run = runBackupScript({ DB_STORAGE: db, BACKUP_DIR: backups, OFFSITE_DIR: nas });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Auf NAS kopiert/);
  assert.equal(fs.readdirSync(nas).filter((f) => BACKUP_PATTERN.test(f)).length, 1);
  assert.equal(evaluateBackupStatus(readStatus(backups)).state, 'ok');
});

test('Skript: NAS nicht eingebunden → Exit 1, lokale Sicherung bleibt, Status meldet Fehler', async () => {
  const db = await makeDb('cli2.db');
  const backups = path.join(workdir, 'cli2-backups');
  const unmounted = makeNas('cli2-nas', { marker: false });

  const run = runBackupScript({ DB_STORAGE: db, BACKUP_DIR: backups, OFFSITE_DIR: unmounted });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /NAS nicht eingebunden/);
  assert.equal(fs.readdirSync(backups).filter((f) => BACKUP_PATTERN.test(f)).length, 1, 'lokale Sicherung existiert');
  const evaluated = evaluateBackupStatus(readStatus(backups));
  assert.equal(evaluated.state, 'error');
  assert.match(evaluated.message, /NAS/);
});

test('Skript: ohne NAS-Einstellung → Exit 0, Hinweis, Status "warning"', async () => {
  const db = await makeDb('cli3.db');
  const backups = path.join(workdir, 'cli3-backups');
  const run = runBackupScript({ DB_STORAGE: db, BACKUP_DIR: backups, OFFSITE_DIR: '' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Keine externe Ablage/);
  assert.equal(evaluateBackupStatus(readStatus(backups)).state, 'warning');
});

test('Skript: fehlende Datenbank → Exit 1 und Status "error"', () => {
  const backups = path.join(workdir, 'cli4-backups');
  const run = runBackupScript({ DB_STORAGE: path.join(workdir, 'weg.db'), BACKUP_DIR: backups, OFFSITE_DIR: '' });
  assert.equal(run.status, 1);
  assert.equal(evaluateBackupStatus(readStatus(backups)).state, 'error');
});

test('Healthcheck: Exit-Code folgt dem Status', async () => {
  const db = await makeDb('cli5.db');
  const backups = path.join(workdir, 'cli5-backups');
  const health = () =>
    runScript('backup-healthcheck', { BACKUP_DIR: backups });

  assert.equal(health().status, 1, 'ohne Statusdatei: nicht gesund');
  runBackupScript({ DB_STORAGE: db, BACKUP_DIR: backups, OFFSITE_DIR: makeNas('cli5-nas') });
  assert.equal(health().status, 0, 'nach erfolgreicher Sicherung: gesund');
});
