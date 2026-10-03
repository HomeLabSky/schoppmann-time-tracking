/**
 * Zeiteinträge: abgeleitete Werte (Arbeitszeit, Verdienst aus dem eingefrorenen Stundensatz) und die
 * Antwortform der API. Die Fachregeln (Dauer, Datumsfenster) stehen in utils/billing.ts.
 */
import type { TimeEntryRow } from '../db/schema';
import * as billing from '../utils/billing';

export interface TimeEntryJSON extends TimeEntryRow {
  workMinutes: number;
  workTime: string;
  totalHours: number;
  earningsCents: number;
  earnings: number;
  hourlyRate: number;
  formattedEarnings: string;
}

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export const entryWorkMinutes = (entry: Pick<TimeEntryRow, 'startTime' | 'endTime' | 'breakMinutes'>): number =>
  billing.workMinutes(entry.startTime, entry.endTime, entry.breakMinutes);

export const entryEarningsCents = (entry: Pick<TimeEntryRow, 'startTime' | 'endTime' | 'breakMinutes' | 'hourlyRateCents'>): number =>
  billing.earningsCents(entryWorkMinutes(entry), entry.hourlyRateCents ?? billing.DEFAULT_HOURLY_RATE_CENTS);

const hhmm = (time: string): string => String(time).substring(0, 5);

/** API-Form eines Eintrags: Zeiten als HH:mm, Beträge aus dem eingefrorenen Stundensatz */
export const toTimeEntryJSON = (entry: TimeEntryRow): TimeEntryJSON => {
  const minutes = entryWorkMinutes(entry);
  const cents = entryEarningsCents(entry);
  const earnings = billing.toEuros(cents);
  return {
    ...entry,
    startTime: hhmm(entry.startTime),
    endTime: hhmm(entry.endTime),
    workMinutes: minutes,
    workTime: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    totalHours: Math.round((minutes / 60) * 100) / 100,
    earningsCents: cents,
    earnings,
    hourlyRate: billing.toEuros(entry.hourlyRateCents ?? billing.DEFAULT_HOURLY_RATE_CENTS),
    formattedEarnings: euroFormat.format(earnings)
  };
};

/** "H:mm", "HH:mm" oder "HH:mm:ss" → "HH:mm:ss" (Speicherformat) */
export const normalizeTime = (time: string): string => {
  const cleaned = String(time).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(cleaned)) return cleaned;
  const match = /^(\d{1,2}):(\d{2})$/.exec(cleaned);
  if (match) return `${match[1]!.padStart(2, '0')}:${match[2]}:00`;
  throw new Error(`Ungültiges Zeitformat: ${time}`);
};

const TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Format-Prüfung der Eingabe (zweite Linie hinter den zod-Schemas, z. B. für direkte Service-Aufrufe).
 * Fachregeln (Dauer, Datumsfenster): utils/billing.ts → validateEntryRules
 * @returns Fehlermeldungen (leer = gültig)
 */
export const validateTimeEntryFormat = (data: {
  userId?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number | string | null;
}): string[] => {
  const errors: string[] = [];
  if (!data.userId) errors.push('Benutzer-ID ist erforderlich');
  if (!data.date) errors.push('Datum ist erforderlich');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) errors.push('Datum muss im Format YYYY-MM-DD sein');
  if (!data.startTime) errors.push('Startzeit ist erforderlich');
  else if (!TIME_PATTERN.test(String(data.startTime).substring(0, 5))) errors.push('Startzeit muss im Format HH:mm sein');
  if (!data.endTime) errors.push('Endzeit ist erforderlich');
  else if (!TIME_PATTERN.test(String(data.endTime).substring(0, 5))) errors.push('Endzeit muss im Format HH:mm sein');
  if (data.breakMinutes !== undefined && data.breakMinutes !== null) {
    const minutes = parseInt(String(data.breakMinutes), 10);
    if (Number.isNaN(minutes) || minutes < 0 || minutes > 480) errors.push('Pausendauer muss zwischen 0 und 480 Minuten liegen');
  }
  return errors;
};
