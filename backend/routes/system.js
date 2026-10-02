/**
 * Systemstatus für Admins (/api/admin/system).
 *
 * GET /backup – Zustand der Datensicherung (aus status.json des Backup-Dienstes), damit ein
 * stiller Ausfall (z. B. NAS nicht eingebunden) auf der Admin-Startseite sichtbar wird.
 */
const express = require('express');
const path = require('path');
const { requireAdmin } = require('../middleware/auth');
const { readStatus, evaluateBackupStatus } = require('../utils/backupStatus');

const router = express.Router();

const backupDir = () => path.resolve(__dirname, '..', process.env.BACKUP_DIR || './backups');

router.get('/backup', requireAdmin, (req, res) => {
  const status = readStatus(backupDir());
  const evaluation = evaluateBackupStatus(status);

  res.json({
    success: true,
    message: 'Sicherungsstatus erfolgreich geladen',
    data: {
      ...evaluation,
      lastAttemptAt: status?.lastAttemptAt ?? null,
      lastFile: status?.local?.file ?? null,
      lastError: status?.local?.error || status?.offsite?.error || null
    }
  });
});

module.exports = router;
