/**
 * Dauerlauf für den Backup-Container: Sicherung sofort beim Start und danach täglich zur Uhrzeit BACKUP_TIME.
 *
 *   BACKUP_TIME  Uhrzeit HH:MM in der Zeitzone des Containers (TZ), Standard 02:30
 *
 * Ein fehlgeschlagener Lauf beendet den Dienst nicht; der Fehler steht im Log und in status.json
 * (sichtbar im Container-Healthcheck und auf der Admin-Startseite).
 */
const { spawn } = require('child_process');
const path = require('path');
const { msUntilNext } = require('../utils/schedule');

const time = process.env.BACKUP_TIME || '02:30';
try {
  msUntilNext(new Date(), time); // Format früh prüfen
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

let timer = null;
let child = null;

const runOnce = () =>
  new Promise((resolve) => {
    console.log(`⏰ ${new Date().toLocaleString('de-DE')} – Sicherung startet`);
    child = spawn(process.execPath, [path.join(__dirname, 'backup-db.js')], { stdio: 'inherit' });
    child.on('exit', (code) => {
      child = null;
      if (code !== 0) console.error(`⚠️ Sicherung endete mit Fehlercode ${code}`);
      resolve();
    });
  });

const scheduleNext = () => {
  const wait = msUntilNext(new Date(), time);
  console.log(`🕑 Nächste Sicherung um ${time} (in ${Math.round(wait / 60000)} Minuten)`);
  timer = setTimeout(async () => {
    await runOnce();
    scheduleNext();
  }, wait);
};

const stop = () => {
  if (timer) clearTimeout(timer);
  if (child) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

runOnce().then(scheduleNext);
