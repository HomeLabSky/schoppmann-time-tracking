/**
 * Status der Datensicherung.
 *
 * Das Backup-Skript schreibt nach jedem Lauf eine kleine Datei `status.json` in den Backup-Ordner.
 * Daraus bewerten der Container-Healthcheck und die Admin-Oberfläche, ob die Sicherung wirklich läuft –
 * damit ein stiller Ausfall (z. B. NAS nicht erreichbar) nicht erst im Ernstfall auffällt.
 */
import fs from 'node:fs';
import path from 'node:path';

export const STATUS_FILE = 'status.json';
export const MAX_AGE_HOURS = 36; // eine tägliche Sicherung darf höchstens einen Tag plus Puffer alt sein

export interface BackupStatusFile {
  lastAttemptAt: string;
  local: { ok: boolean; lastSuccessAt: string | null; file: string | null; bytes: number | null; error: string | null };
  offsite: { configured: boolean; ok: boolean | null; lastSuccessAt: string | null; error: string | null; keep: number | null };
}

export interface BackupRun {
  now?: Date;
  local: { ok: boolean; file?: string; bytes?: number; error?: string };
  offsite: { configured: boolean; ok?: boolean; error?: string; keep?: number };
}

export type BackupState = 'ok' | 'warning' | 'error' | 'unknown';

export interface BackupEvaluation {
  state: BackupState;
  message: string;
  localAgeHours: number | null;
  offsiteAgeHours: number | null;
  offsiteConfigured: boolean;
  lastSuccessAt: string | null;
  offsiteLastSuccessAt: string | null;
}

export const statusPath = (dir: string): string => path.join(dir, STATUS_FILE);

export const readStatus = (dir: string): BackupStatusFile | null => {
  try {
    return JSON.parse(fs.readFileSync(statusPath(dir), 'utf8')) as BackupStatusFile;
  } catch {
    return null;
  }
};

/**
 * Schreibt den Status eines Backup-Laufs und behält dabei den Zeitpunkt der letzten
 * ERFOLGREICHEN Sicherung, wenn der aktuelle Lauf fehlschlägt.
 * @param dir Backup-Ordner
 */
export const recordRun = (dir: string, { now = new Date(), local, offsite }: BackupRun): BackupStatusFile => {
  const previous: Partial<BackupStatusFile> = readStatus(dir) || {};
  const at = now.toISOString();

  const next: BackupStatusFile = {
    lastAttemptAt: at,
    local: {
      ok: local.ok,
      lastSuccessAt: local.ok ? at : previous.local?.lastSuccessAt ?? null,
      file: local.ok ? local.file ?? null : previous.local?.file ?? null,
      bytes: local.ok ? local.bytes ?? null : previous.local?.bytes ?? null,
      error: local.ok ? null : local.error ?? null
    },
    offsite: {
      configured: !!offsite.configured,
      ok: offsite.configured ? !!offsite.ok : null,
      lastSuccessAt: offsite.configured && offsite.ok ? at : previous.offsite?.lastSuccessAt ?? null,
      error: offsite.configured && !offsite.ok ? offsite.error ?? null : null,
      keep: offsite.keep ?? null
    }
  };

  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${statusPath(dir)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, statusPath(dir)); // atomar: Leser sehen nie eine halbe Datei
  return next;
};

const hoursSince = (iso: string | null | undefined, now: Date): number | null => (iso ? (now.getTime() - new Date(iso).getTime()) / 3600000 : null);

/** Bewertet den Status. */
export const evaluateBackupStatus = (
  status: BackupStatusFile | null,
  now: Date = new Date(),
  { maxAgeHours = MAX_AGE_HOURS }: { maxAgeHours?: number } = {}
): BackupEvaluation => {
  const base: Omit<BackupEvaluation, 'state' | 'message'> = {
    localAgeHours: null,
    offsiteAgeHours: null,
    offsiteConfigured: false,
    lastSuccessAt: null,
    offsiteLastSuccessAt: null
  };
  if (!status) {
    return { ...base, state: 'unknown', message: 'Es wurde noch keine Sicherung gefunden.' };
  }

  const localAge = hoursSince(status.local?.lastSuccessAt, now);
  const offsiteConfigured = !!status.offsite?.configured;
  const offsiteAge = hoursSince(status.offsite?.lastSuccessAt, now);
  const info: Omit<BackupEvaluation, 'state' | 'message'> = {
    localAgeHours: localAge === null ? null : Math.round(localAge * 10) / 10,
    offsiteAgeHours: offsiteAge === null ? null : Math.round(offsiteAge * 10) / 10,
    offsiteConfigured,
    lastSuccessAt: status.local?.lastSuccessAt ?? null,
    offsiteLastSuccessAt: status.offsite?.lastSuccessAt ?? null
  };

  if (localAge === null || localAge > maxAgeHours) {
    const detail = status.local?.error ? ` (${status.local.error})` : '';
    return {
      ...info,
      state: 'error',
      message: localAge === null
        ? `Es gab noch keine erfolgreiche Sicherung${detail}.`
        : `Die letzte erfolgreiche Sicherung ist ${Math.floor(localAge)} Stunden alt${detail}.`
    };
  }

  if (!offsiteConfigured) {
    return { ...info, state: 'warning', message: 'Sicherung läuft, aber es ist keine externe Ablage (NAS) eingerichtet.' };
  }

  if (offsiteAge === null || offsiteAge > maxAgeHours) {
    const detail = status.offsite?.error ? ` ${status.offsite.error}` : '';
    return {
      ...info,
      state: 'error',
      message: `Die Sicherung auf dem NAS ist ${offsiteAge === null ? 'noch nie gelungen' : `${Math.floor(offsiteAge)} Stunden alt`}.${detail}`
    };
  }

  if (status.offsite?.ok === false) {
    return { ...info, state: 'warning', message: `Der letzte Lauf konnte nicht auf das NAS kopieren. ${status.offsite.error || ''}`.trim() };
  }

  return { ...info, state: 'ok', message: 'Sicherung und NAS-Ablage sind aktuell.' };
};

