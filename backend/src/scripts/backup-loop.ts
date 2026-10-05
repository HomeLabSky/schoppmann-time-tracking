/**
 * Dauerlauf für den Backup-Container: Sicherung sofort beim Start und danach täglich zur Uhrzeit BACKUP_TIME.
 *
 *   BACKUP_TIME  Uhrzeit HH:MM in der Zeitzone des Containers (TZ), Standard 02:30
 *
 * Ein fehlgeschlagener Lauf beendet den Dienst nicht; der Fehler steht im Log und in status.json
 * (sichtbar im Container-Healthcheck und auf der Admin-Startseite).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { msUntilNext } from '../utils/schedule';

// Kompiliert (dist/*.js) oder in der Entwicklung über tsx (src/*.ts): gleiche Endung und Loader wie dieser Prozess
const BACKUP_SCRIPT = path.join(__dirname, `backup-db${path.extname(__filename)}`);

const time = process.env.BACKUP_TIME || '02:30';
try {
  msUntilNext(new Date(), time); // Format früh prüfen
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

let timer: NodeJS.Timeout | null = null;
let child: ChildProcess | null = null;

const runOnce = (): Promise<void> =>
  new Promise((resolve) => {
    console.log(`⏰ ${new Date().toLocaleString('de-DE')} – Sicherung startet`);
    child = spawn(process.execPath, [...process.execArgv, BACKUP_SCRIPT], { stdio: 'inherit' });
    child.on('exit', (code) => {
      child = null;
      if (code !== 0) console.error(`⚠️ Sicherung endete mit Fehlercode ${code}`);
      resolve();
    });
    // Prozess ließ sich nicht starten: ohne diesen Handler würde der Dienst abstürzen bzw. nie neu planen
    child.on('error', (error) => {
      child = null;
      console.error(`⚠️ Sicherung konnte nicht gestartet werden: ${error.message}`);
      resolve();
    });
  });

const scheduleNext = (): void => {
  const wait = msUntilNext(new Date(), time);
  console.log(`🕑 Nächste Sicherung um ${time} (in ${Math.round(wait / 60000)} Minuten)`);
  timer = setTimeout(() => void runOnce().then(scheduleNext), wait);
};

const stop = (): void => {
  if (timer) clearTimeout(timer);
  if (child) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

void runOnce().then(scheduleNext);
