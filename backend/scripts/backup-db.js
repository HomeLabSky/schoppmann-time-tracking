/**
 * Datenbank-Sicherung (läuft auch bei laufendem Backend), optional mit Kopie auf das NAS.
 *
 * Aufruf (im Ordner backend):
 *   npm run db:backup
 *
 * Umgebung (optional, auch aus backend/.env):
 *   DB_STORAGE     Pfad der Datenbank (Standard ./database/timetracking.db, relativ zu backend/)
 *   BACKUP_DIR     Zielordner der lokalen Sicherungen (Standard backend/backups)
 *   BACKUP_KEEP    Anzahl lokal aufbewahrter Sicherungen (Standard 30)
 *   OFFSITE_DIR    Externe Ablage, z. B. das eingebundene NAS (leer = keine). Dort muss die
 *                  Markierungsdatei .zeiterfassung-offsite liegen (schützt vor "NAS nicht eingebunden").
 *   OFFSITE_KEEP   Anzahl auf dem NAS aufbewahrter Sicherungen (Standard 90)
 *
 * Nach jedem Lauf wird BACKUP_DIR/status.json aktualisiert (Healthcheck und Admin-Oberfläche).
 * Exit-Code 1, wenn die lokale Sicherung ODER die NAS-Kopie fehlschlägt.
 */
const path = require('path');
require('dotenv').config({ quiet: true });
const { createBackup, copyToOffsite } = require('../utils/dbBackup');
const { recordRun } = require('../utils/backupStatus');

const source = path.resolve(__dirname, '..', process.env.DB_STORAGE || './database/timetracking.db');
const dir = path.resolve(__dirname, '..', process.env.BACKUP_DIR || './backups');
const keep = parseInt(process.env.BACKUP_KEEP) || 30;
const offsiteDir = process.env.OFFSITE_DIR ? path.resolve(process.env.OFFSITE_DIR) : null;
const offsiteKeep = parseInt(process.env.OFFSITE_KEEP) || 90;

(async () => {
  let local;
  try {
    const result = await createBackup({ source, dir, keep });
    local = { ok: true, file: path.basename(result.file), bytes: result.bytes };
    console.log(`✅ Sicherung erstellt: ${result.file} (${(result.bytes / 1024).toFixed(0)} KB, ${result.users} Benutzer, Integrität ok)`);
    if (result.removed.length > 0) {
      console.log(`🧹 ${result.removed.length} ältere lokale Sicherung(en) entfernt (aufbewahrt: ${keep})`);
    }

    let offsite = { configured: false };
    if (offsiteDir) {
      try {
        const copy = await copyToOffsite({ file: result.file, dir: offsiteDir, keep: offsiteKeep });
        offsite = { configured: true, ok: true, keep: offsiteKeep };
        console.log(`✅ Auf NAS kopiert: ${copy.file}`);
        if (copy.removed.length > 0) {
          console.log(`🧹 ${copy.removed.length} ältere NAS-Sicherung(en) entfernt (aufbewahrt: ${offsiteKeep})`);
        }
      } catch (error) {
        offsite = { configured: true, ok: false, error: error.message, keep: offsiteKeep };
        console.error(`❌ Kopie auf das NAS fehlgeschlagen: ${error.message}`);
      }
    } else {
      console.log('ℹ️  Keine externe Ablage konfiguriert (OFFSITE_DIR leer) – Sicherung liegt nur auf diesem Server.');
    }

    recordRun(dir, { local, offsite });
    if (offsite.configured && !offsite.ok) process.exit(1);
  } catch (error) {
    local = { ok: false, error: error.message };
    console.error(`❌ Sicherung fehlgeschlagen: ${error.message}`);
    try {
      recordRun(dir, { local, offsite: { configured: !!offsiteDir, ok: false, error: 'Lokale Sicherung fehlgeschlagen', keep: offsiteKeep } });
    } catch (statusError) {
      console.error(`❌ Status konnte nicht geschrieben werden: ${statusError.message}`);
    }
    process.exit(1);
  }
})();
