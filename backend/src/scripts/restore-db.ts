/**
 * Stellt eine Datenbank-Sicherung wieder her.
 *
 * Aufruf (im Ordner backend, Backend vorher STOPPEN):
 *   npm run db:restore -- backups/timetracking-20261002-031500.db
 *
 * Die Sicherung wird zuerst auf Integrität geprüft. Die bisherige Datenbank bleibt als
 * `<datenbank>.vor-wiederherstellung-<zeit>` erhalten. Danach das Backend wieder starten.
 */
import '../lib/env';
import path from 'node:path';
import { fromBackendRoot } from '../lib/paths';
import { restoreBackup } from '../utils/dbBackup';

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) {
  console.error('❌ Bitte die Sicherungsdatei angeben: npm run db:restore -- backups/timetracking-JJJJMMTT-HHMMSS.db');
  process.exit(1);
}

const target = fromBackendRoot(process.env.DB_STORAGE || './database/timetracking.db');

restoreBackup({ backup: path.resolve(process.cwd(), file), target })
  .then(({ target: restored, safetyCopy, users }) => {
    console.log(`✅ Wiederhergestellt: ${restored} (${users} Benutzer, Integrität ok)`);
    if (safetyCopy) console.log(`💾 Bisherige Datenbank gesichert als: ${safetyCopy}`);
    console.log('➡️  Jetzt das Backend wieder starten.');
  })
  .catch((error: unknown) => {
    console.error(`❌ Wiederherstellung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    console.error('   Die vorhandene Datenbank wurde nicht verändert.');
    process.exit(1);
  });
