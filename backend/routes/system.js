/**
 * Systemstatus für Admins (/admin/system).
 *
 * GET /backup – Zustand der Datensicherung (aus status.json des Backup-Dienstes), damit ein stiller Ausfall
 * (z. B. NAS nicht eingebunden) auf der Admin-Startseite sichtbar wird.
 */
const path = require('path');
const { createApiRouter } = require('../lib/route');
const { readStatus, evaluateBackupStatus } = require('../utils/backupStatus');
const { BackupStatus } = require('../schemas/admin');

const api = createApiRouter('/admin/system', { tags: ['System'] });

const backupDir = () => path.resolve(__dirname, '..', process.env.BACKUP_DIR || './backups');

api.get('/backup', {
  summary: 'Zustand der Datensicherung',
  auth: 'admin',
  response: BackupStatus,
  message: 'Sicherungsstatus erfolgreich geladen'
}, async () => {
  const status = readStatus(backupDir());
  return {
    data: {
      ...evaluateBackupStatus(status),
      lastAttemptAt: status?.lastAttemptAt ?? null,
      lastFile: status?.local?.file ?? null,
      lastError: status?.local?.error || status?.offsite?.error || null
    }
  };
});

module.exports = api.router;
