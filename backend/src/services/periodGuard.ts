/**
 * Prüfungen rund um abgeschlossene Abrechnungsperioden.
 * Bewusst eigenes Modul (nur Datenzugriff), damit Zeiterfassung und Abschluss-Service
 * sich nicht gegenseitig importieren müssen.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { periodClosures, timeEntries, users, type PeriodClosure, type TimeEntryRow } from '../db/schema';
import { AppError } from '../lib/errors';
import { DateService, type BillingPeriod } from './dateService';

/** Liegt der Zeitraum [a1,a2] teilweise in [b1,b2]? (alles YYYY-MM-DD) */
export const overlaps = (a1: string, a2: string, b1: string, b2: string): boolean => a1 <= b2 && a2 >= b1;

/**
 * Datum, nach dem ein Eintrag einer Periode zugeordnet wird: bei Nachträgen das Abrechnungsdatum, sonst der
 * Arbeitstag. Als SQL-Ausdruck für Abfragen und als Funktion für geladene Einträge.
 */
export const billingDateSql = sql<string>`coalesce(${timeEntries.billingDate}, ${timeEntries.date})`;
export const billingDateOf = (entry: Pick<TimeEntryRow, 'date' | 'billingDate'>): string => entry.billingDate ?? entry.date;

/** Abschluss, der das Datum abdeckt (oder undefined). */
export const findClosureCovering = (userId: number, date: string): PeriodClosure | undefined =>
  db().select().from(periodClosures)
    .where(and(eq(periodClosures.userId, userId), lte(periodClosures.periodStart, date), gte(periodClosures.periodEnd, date)))
    .get();

/**
 * Wirft PERIOD_CLOSED, wenn das Datum in einer abgeschlossenen Periode liegt.
 * Gilt für Ändern und Löschen von Zeiteinträgen (innerhalb deren Transaktion aufrufen, mit billingDateOf).
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

const referenceDate = (year: number, month: number): string => {
  const d = new Date(Date.UTC(year, month - 1, 15));
  return d.toISOString().slice(0, 10);
};

/**
 * Nachtrag: Liegt der Arbeitstag in einer abgeschlossenen Periode, die erste nicht abgeschlossene Periode danach
 * (nach den aktuellen Einstellungen des Mitarbeiters). Liegt er in einer offenen Periode: undefined.
 */
export const nextOpenPeriodFor = (userId: number, date: string): BillingPeriod | undefined => {
  const closures = db().select().from(periodClosures).where(eq(periodClosures.userId, userId)).all();
  if (!closures.some((c) => c.periodStart <= date && c.periodEnd >= date)) return undefined;

  const user = db().select({ start: users.abrechnungStart, end: users.abrechnungEnde }).from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  const [year = 0, month = 1] = date.split('-').map(Number);
  // Ab dem Vormonat suchen: Bei monatsübergreifenden Perioden (22.–21.) beginnt die Periode des Tages dort
  for (let i = -1; i < 600; i++) {
    const period = DateService.createBillingPeriod(user.start || 1, user.end || 31, referenceDate(year, month + i));
    if (period.endDate < date) continue;
    if (!closures.some((c) => overlaps(period.startDate, period.endDate, c.periodStart, c.periodEnd))) return period;
  }
  throw new AppError('PERIOD_CLOSED', 'Keine offene Abrechnungsperiode für den Nachtrag gefunden');
};
