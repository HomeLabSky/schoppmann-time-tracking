/**
 * Datenbank-Sicherung (läuft auch bei laufendem Backend).
 *
 * Aufruf (im Ordner backend):
 *   npm run db:backup
 *
 * Umgebung (optional, auch aus backend/.env):
 *   DB_STORAGE   Pfad der Datenbank (Standard ./database/timetracking.db, relativ zu backend/)
 *   BACKUP_DIR   Zielordner der Sicherungen (Standard backend/backups)
 *   BACKUP_KEEP  Anzahl aufzubewahrender Sicherungen (Standard 30)
 *
 * Hinweis: Eine Sicherung auf demselben Rechner schützt nicht vor Rechnerausfall.
 * Den Backup-Ordner zusätzlich extern ablegen (siehe deploy/README.md).
 */
const path = require('path');
require('dotenv').config({ quiet: true });
const { createBackup } = require('../utils/dbBackup');

const source = path.resolve(__dirname, '..', process.env.DB_STORAGE || './database/timetracking.db');
const dir = path.resolve(__dirname, '..', process.env.BACKUP_DIR || './backups');
const keep = parseInt(process.env.BACKUP_KEEP) || 30;

createBackup({ source, dir, keep })
  .then(({ file, bytes, users, removed }) => {
    console.log(`✅ Sicherung erstellt: ${file} (${(bytes / 1024).toFixed(0)} KB, ${users} Benutzer, Integrität ok)`);
    if (removed.length > 0) {
      console.log(`🧹 ${removed.length} ältere Sicherung(en) entfernt (aufbewahrt: ${keep})`);
    }
  })
  .catch((error) => {
    console.error(`❌ Sicherung fehlgeschlagen: ${error.message}`);
    process.exit(1);
  });
