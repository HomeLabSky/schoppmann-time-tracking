/**
 * Healthcheck des Backup-Containers: Exit 0, wenn die Sicherung (und – falls eingerichtet – die NAS-Kopie)
 * frisch ist; sonst Exit 1. `docker compose ps` zeigt den Dienst dann als "unhealthy".
 */
import { fromBackendRoot } from '../lib/paths';
import { evaluateBackupStatus, readStatus } from '../utils/backupStatus';

const dir = fromBackendRoot(process.env.BACKUP_DIR || './backups');
const result = evaluateBackupStatus(readStatus(dir));

console.log(`${result.state}: ${result.message}`);
process.exit(result.state === 'ok' || result.state === 'warning' ? 0 : 1);
