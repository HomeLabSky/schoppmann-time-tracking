/**
 * Prüfungen rund um abgeschlossene Abrechnungsperioden.
 * Bewusst eigenes Modul (nur Datenzugriff), damit Zeiterfassung und Abschluss-Service
 * sich nicht gegenseitig importieren müssen.
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { periodClosures, type PeriodClosure } from '../db/schema';
import { AppError } from '../lib/errors';
import { DateService } from './dateService';

/** Liegt der Zeitraum [a1,a2] teilweise in [b1,b2]? (alles YYYY-MM-DD) */
export const overlaps = (a1: string, a2: string, b1: string, b2: string): boolean => a1 <= b2 && a2 >= b1;

/** Abschluss, der das Datum abdeckt (oder undefined). */
export const findClosureCovering = (userId: number, date: string): PeriodClosure | undefined =>
  db().select().from(periodClosures)
    .where(and(eq(periodClosures.userId, userId), lte(periodClosures.periodStart, date), gte(periodClosures.periodEnd, date)))
    .get();

/**
 * Wirft PERIOD_CLOSED, wenn das Datum in einer abgeschlossenen Periode liegt.
 * Gilt für Anlegen, Ändern und Löschen von Zeiteinträgen (innerhalb deren Transaktion aufrufen).
 */
export const assertDateOpen = (userId: number, date: string): void => {
  const closure = findClosureCovering(userId, date);
  if (closure) {
    const range = `${DateService.formatDateForDisplay(closure.periodStart)} – ${DateService.formatDateForDisplay(closure.periodEnd)}`;
    throw new AppError('PERIOD_CLOSED',
      `Der Abrechnungszeitraum ${range} ist abgeschlossen. ` +
      'Änderungen sind erst nach Wiedereröffnung durch einen Administrator möglich.'
    );
  }
};
