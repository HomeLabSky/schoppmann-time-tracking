import { and, asc, between, eq, lt } from 'drizzle-orm';
import { db, transaction } from '../db/client';
import { minijobSettings, periodClosures, timeEntries, users, type PeriodClosure, type TimeEntryRow } from '../db/schema';
import { AppError } from '../lib/errors';
import logger from '../lib/logger';
import {
  entryEarningsCents, entryWorkMinutes, normalizeTime, toTimeEntryJSON, validateTimeEntryFormat, type TimeEntryJSON
} from '../models/timeEntry';
import * as billing from '../utils/billing';
import { todayString } from '../utils/clock';
import { AuditService, type Actor } from './auditService';
import { DateService, type BillingPeriod } from './dateService';
import { assertDateOpen, overlaps } from './periodGuard';

/** Referenzdatum (Monatsmitte) einer Abrechnungsperiode */
const referenceDate = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}-15`;

/** Für das Änderungsprotokoll: nur fachlich relevante Felder, Zeiten als HH:mm. */
const entrySnapshot = (entry: TimeEntryRow) => ({
  date: entry.date,
  startTime: String(entry.startTime).substring(0, 5),
  endTime: String(entry.endTime).substring(0, 5),
  breakMinutes: entry.breakMinutes,
  description: entry.description || null,
  hourlyRateCents: entry.hourlyRateCents
});

/** Auslöser für das Protokoll; ohne Angabe gilt der Mitarbeiter selbst. */
const resolveActor = (actor: Actor | undefined, userId: number): Actor => actor || { id: userId };

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export interface PeriodOption {
  value: string;
  label: string;
  year: number;
  month: number;
  monthName: string;
  startDate: string;
  endDate: string;
  referenceMonth?: number;
  referenceYear?: number;
  isCurrent: boolean;
  isClosed?: boolean;
}

export interface CreateEntryInput {
  userId: number;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number | null | undefined;
  description?: string | null | undefined;
  clientId?: string | undefined;
}

export interface UpdateEntryInput {
  startTime?: string | undefined;
  endTime?: string | undefined;
  breakMinutes?: number | null | undefined;
  description?: string | null | undefined;
}

const assertValid = (errors: string[]): void => {
  if (errors.length > 0) throw new AppError('VALIDATION_ERROR', errors.join(', '));
};

/** Einträge eines Mitarbeiters vom Vortag bis zum Folgetag (Nachtschichten können in den Tag hineinreichen) */
const entriesAround = (userId: number, date: string): TimeEntryRow[] =>
  db().select().from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), between(timeEntries.date, billing.addDays(date, -1), billing.addDays(date, 1))))
    .all();

const hhmm = (time: string): string => String(time).substring(0, 5);

/**
 * Regeln über mehrere Einträge: keine zeitliche Überschneidung (auch über Mitternacht) und höchstens
 * 12 Stunden Arbeitszeit je Tag. `entry.id` = bearbeiteter Eintrag (zählt nicht gegen sich selbst).
 */
const assertFitsDay = (entry: billing.DayEntry & { userId: number }, around: TimeEntryRow[]): void => {
  const overlap = billing.findOverlap(entry, around);
  if (overlap) {
    throw new AppError('ENTRY_OVERLAP',
      `Überschneidet sich mit dem Eintrag am ${DateService.formatDateForDisplay(overlap.date)}, ` +
      `${hhmm(overlap.startTime)}–${hhmm(overlap.endTime)} Uhr`
    );
  }
  assertValid(billing.validateDayRules(entry, around));
};

const findOwnEntry = (entryId: number, userId: number): TimeEntryRow => {
  const entry = db().select().from(timeEntries)
    .where(and(eq(timeEntries.id, entryId), eq(timeEntries.userId, userId))) // nur eigene Einträge
    .get();
  if (!entry) throw new AppError('ENTRY_NOT_FOUND', 'Zeiteintrag nicht gefunden');
  return entry;
};

/**
 * Zeiterfassung und Abrechnung je Periode.
 * Die reine Rechenlogik (Cent-Beträge, Übertrag, Fachregeln) liegt in utils/billing.ts.
 * Jede Änderung wird in derselben Transaktion im Änderungsprotokoll festgehalten
 * und ist in abgeschlossenen Perioden gesperrt.
 */
export class TimeEntryService {
  /**
   * Alle Abrechnungsperioden vom Monat des ersten Eintrags bis einschließlich der
   * Zielperiode (chronologisch). Ohne frühere Einträge nur die Zielperiode.
   */
  static listPeriodsUpTo(userId: number, startDay: number, endDay: number, year: number, month: number): BillingPeriod[] {
    const target = DateService.createBillingPeriod(startDay, endDay, referenceDate(year, month));

    const first = db().select({ date: timeEntries.date }).from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), lt(timeEntries.date, target.startDate)))
      .orderBy(asc(timeEntries.date))
      .get();
    if (!first) return [target];

    const [firstYear = 0, firstMonth = 1, firstDay = 1] = first.date.split('-').map(Number);
    let currentYear = firstYear;
    let currentMonth = firstMonth;

    // Bei periodenübergreifenden Abrechnungen (z. B. 22.–21.) gehört ein Eintrag vor
    // dem Starttag noch zur Periode des Vormonats.
    if (startDay > endDay && firstDay < startDay) {
      currentMonth -= 1;
      if (currentMonth === 0) {
        currentMonth = 12;
        currentYear -= 1;
      }
    }

    const periods: BillingPeriod[] = [];
    // 600 Monate = 50 Jahre; früher brach die Schleife nach 50 Monaten ab und
    // verfälschte den Übertrag bei langen Beschäftigungen.
    for (let i = 0; i < 600; i++) {
      const period = DateService.createBillingPeriod(startDay, endDay, referenceDate(currentYear, currentMonth));
      if (period.startDate >= target.startDate) break;
      periods.push(period);
      currentMonth += 1;
      if (currentMonth === 13) {
        currentMonth = 1;
        currentYear += 1;
      }
    }
    periods.push(target);
    return periods;
  }

  /**
   * Zeiteinträge eines Mitarbeiters für eine Abrechnungsperiode inkl. Minijob-Übersicht. Der Übertrag wird über
   * alle früheren Perioden mit der jeweils damals gültigen Grenze und den eingefrorenen Stundensätzen berechnet.
   * Für abgeschlossene Perioden gelten die beim Abschluss eingefrorenen Zahlen.
   * @param month Referenzmonat (1-12)
   */
  static async getMonthlyTimeRecords(userId: number, year: number, month: number) {
    return this.getMonthlyTimeRecordsSync(userId, year, month);
  }

  /** Synchron – für Aufrufe innerhalb einer Transaktion (Monatsabschluss) */
  static getMonthlyTimeRecordsSync(userId: number, year: number, month: number) {
    const user = db().select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');

    const startDay = user.abrechnungStart || 1;
    const endDay = user.abrechnungEnde || 31;

    const periods = this.listPeriodsUpTo(userId, startDay, endDay, year, month);
    const target = periods[periods.length - 1] as BillingPeriod;
    const firstPeriod = periods[0] as BillingPeriod;

    const settings = db().select().from(minijobSettings).all();
    const closures = db().select().from(periodClosures).where(eq(periodClosures.userId, userId)).all();
    const entries = db().select().from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), between(timeEntries.date, firstPeriod.startDate, target.endDate)))
      .orderBy(asc(timeEntries.date), asc(timeEntries.startTime))
      .all();

    const closureFor = (period: BillingPeriod): PeriodClosure | null =>
      closures.find((c) => overlaps(period.startDate, period.endDate, c.periodStart, c.periodEnd)) || null;

    const rows = periods.map((period) => {
      const own = entries.filter((e) => e.date >= period.startDate && e.date <= period.endDate);
      const closure = closureFor(period);
      return {
        period,
        closure,
        entries: own,
        // Abgeschlossene Perioden: eingefrorene Werte statt Neuberechnung
        minutes: closure ? closure.totalMinutes : own.reduce((sum, e) => sum + entryWorkMinutes(e), 0),
        earningsCents: closure ? closure.earningsCents : own.reduce((sum, e) => sum + entryEarningsCents(e), 0),
        limitCents: closure ? closure.limitCents : billing.limitCentsForDate(settings, period.endDate),
        limitMissing: !closure && !billing.hasLimitForDate(settings, period.endDate)
      };
    });
    const folded = billing.foldCarry(rows);
    // Ersatz-Grenze ist nur relevant, wo tatsächlich verrechnet wird (Verdienst oder Übertrag > 0)
    const limitMissing = rows.some((row, i) => row.limitMissing && (folded[i]?.actualCents ?? 0) > 0);

    const current = rows[rows.length - 1] as (typeof rows)[number];
    const result = folded[folded.length - 1] as billing.CarryRow;
    const closure = current.closure;
    const hourlyRate = user.stundenlohn == null ? billing.toEuros(billing.DEFAULT_HOURLY_RATE_CENTS) : Number(user.stundenlohn);

    // Anzeige-Werte (Benennung nach End- bzw. Referenzmonat)
    const periodInfo = this.createPeriodObjectForUser(new Date(referenceDate(year, month)), startDay, endDay);

    return {
      records: current.entries.map(toTimeEntryJSON),
      summary: {
        totalHours: Math.round((current.minutes / 60) * 100) / 100,
        totalEarnings: billing.toEuros(current.earningsCents),
        actualEarnings: billing.toEuros(result.actualCents),
        carryIn: billing.toEuros(result.carryInCents),
        carryOut: billing.toEuros(result.carryOutCents),
        paidThisMonth: billing.toEuros(result.paidCents),
        minijobLimit: billing.toEuros(result.limitCents),
        hourlyRate,
        exceedsLimit: result.actualCents > result.limitCents,
        // true: Für diese oder eine frühere offene Periode im Übertrag ist keine Minijob-Grenze
        // hinterlegt – Auszahlung/Übertrag sind vorläufig (Ersatzwert), Abschluss ist gesperrt.
        minijobLimitMissing: limitMissing,
        entryCount: current.entries.length,
        workDays: new Set(current.entries.map((e) => e.date)).size
      },
      period: {
        year: periodInfo.year,
        month: periodInfo.month,
        monthName: periodInfo.monthName,
        startDate: target.startDate,
        endDate: target.endDate,
        description: target.description,
        status: closure ? ('closed' as const) : ('open' as const)
      },
      closure: closure
        ? { closedAt: closure.closedAt, closedBy: closure.closedBy, periodStart: closure.periodStart, periodEnd: closure.periodEnd }
        : null
    };
  }

  /**
   * Erstellt einen neuen Zeiteintrag. Der aktuelle Stundenlohn des Mitarbeiters wird
   * im Eintrag eingefroren; spätere Lohnänderungen wirken nicht rückwirkend.
   */
  static async createTimeEntry(entryData: CreateEntryInput, actor?: Actor): Promise<TimeEntryJSON> {
    const { entry } = await this.createTimeEntryIdempotent(entryData, actor);
    return entry;
  }

  /**
   * Wie createTimeEntry, aber sicher wiederholbar (App, Offline-Erfassung): Gibt es für den Mitarbeiter
   * schon einen Eintrag mit derselben `clientId`, wird nichts angelegt, sondern dieser Eintrag geliefert
   * (`replayed: true`). Dieselbe `clientId` für einen anderen Tag ist ein Client-Fehler → CLIENT_ID_CONFLICT.
   */
  static async createTimeEntryIdempotent(entryData: CreateEntryInput, actor?: Actor): Promise<{ entry: TimeEntryJSON; replayed: boolean }> {
    return transaction(() => {
      if (entryData.clientId) {
        const previous = db().select().from(timeEntries)
          .where(and(eq(timeEntries.userId, entryData.userId), eq(timeEntries.clientId, entryData.clientId)))
          .get();
        if (previous) {
          if (previous.date !== entryData.date) {
            throw new AppError(
              'CLIENT_ID_CONFLICT',
              `Die clientId wurde bereits für einen Eintrag am ${DateService.formatDateForDisplay(previous.date)} verwendet`
            );
          }
          return { entry: toTimeEntryJSON(previous), replayed: true };
        }
      }

      assertValid(validateTimeEntryFormat(entryData));
      // Nur gewünschte Felder übernehmen (kein Mass-Assignment, z. B. von hourlyRateCents)
      const startTime = normalizeTime(entryData.startTime);
      const endTime = normalizeTime(entryData.endTime);
      const around = entriesAround(entryData.userId, entryData.date);
      // Standardpause nur für den ersten Eintrag des Tages; weitere Einträge: Pause liegt dazwischen
      const firstOfDay = !around.some((e) => e.date === entryData.date);
      const breakMinutes = billing.resolveBreakMinutes(entryData.breakMinutes, firstOfDay ? 30 : 0);
      assertValid(billing.validateEntryRules(
        { date: entryData.date, startTime, endTime, breakMinutes },
        { today: todayString(), checkDateWindow: true }
      ));

      assertDateOpen(entryData.userId, entryData.date);
      assertFitsDay({ userId: entryData.userId, date: entryData.date, startTime, endTime, breakMinutes }, around);

      const user = db().select().from(users).where(eq(users.id, entryData.userId)).get();
      if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');

      const created = db().insert(timeEntries).values({
        userId: entryData.userId,
        clientId: entryData.clientId || null,
        date: entryData.date,
        startTime,
        endTime,
        breakMinutes,
        description: entryData.description || null,
        hourlyRateCents: user.stundenlohn == null ? billing.DEFAULT_HOURLY_RATE_CENTS : billing.toCents(user.stundenlohn)
      }).returning().get();

      AuditService.record({
        actor: resolveActor(actor, entryData.userId),
        action: 'time_entry.create',
        entityType: 'TimeEntry',
        entityId: created.id,
        targetUserId: entryData.userId,
        after: entrySnapshot(created)
      });
      return { entry: toTimeEntryJSON(created), replayed: false };
    });
  }

  /** Ändert einen eigenen Eintrag (Datum und eingefrorener Stundensatz bleiben unverändert). */
  static async updateTimeEntry(entryId: number, updateData: UpdateEntryInput, userId: number, actor?: Actor): Promise<TimeEntryJSON> {
    return transaction(() => {
      const entry = findOwnEntry(entryId, userId);
      assertDateOpen(userId, entry.date);

      const merged = {
        userId,
        date: entry.date,
        startTime: updateData.startTime ? normalizeTime(updateData.startTime) : entry.startTime,
        endTime: updateData.endTime ? normalizeTime(updateData.endTime) : entry.endTime,
        breakMinutes: updateData.breakMinutes === undefined || updateData.breakMinutes === null
          ? entry.breakMinutes
          : parseInt(String(updateData.breakMinutes), 10)
      };
      assertValid(validateTimeEntryFormat(merged));
      assertValid(billing.validateEntryRules(merged, { today: todayString() }));
      assertFitsDay({ ...merged, id: entry.id }, entriesAround(userId, entry.date));

      const updated = db().update(timeEntries).set({
        startTime: merged.startTime,
        endTime: merged.endTime,
        breakMinutes: merged.breakMinutes,
        ...(updateData.description !== undefined && { description: updateData.description || null })
      }).where(eq(timeEntries.id, entry.id)).returning().get();

      AuditService.record({
        actor: resolveActor(actor, userId),
        action: 'time_entry.update',
        entityType: 'TimeEntry',
        entityId: entry.id,
        targetUserId: userId,
        before: entrySnapshot(entry),
        after: entrySnapshot(updated)
      });
      return toTimeEntryJSON(updated);
    });
  }

  /** Löscht einen eigenen Eintrag (der gelöschte Zustand bleibt im Änderungsprotokoll erhalten) */
  static async deleteTimeEntry(entryId: number, userId: number, actor?: Actor): Promise<boolean> {
    return transaction(() => {
      const entry = findOwnEntry(entryId, userId);
      assertDateOpen(userId, entry.date);
      db().delete(timeEntries).where(eq(timeEntries.id, entry.id)).run();
      AuditService.record({
        actor: resolveActor(actor, userId),
        action: 'time_entry.delete',
        entityType: 'TimeEntry',
        entityId: entryId,
        targetUserId: userId,
        before: entrySnapshot(entry)
      });
      return true;
    });
  }

  /** Einzelner eigener Eintrag */
  static async getTimeEntry(entryId: number, userId: number): Promise<TimeEntryJSON> {
    return toTimeEntryJSON(findOwnEntry(entryId, userId));
  }

  /** Kennzahlen der letzten `monthsBack` Kalendermonate (chronologisch) */
  static async getMultiMonthStats(userId: number, monthsBack = 12) {
    const stats: (ReturnType<typeof this.getMonthlyTimeRecordsSync>["summary"] & { year: number; month: number; monthName: string })[] = [];
    const now = new Date();
    for (let i = 0; i < monthsBack; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const { summary } = this.getMonthlyTimeRecordsSync(userId, year, month);
      stats.push({ year, month, monthName: this.getMonthName(month), ...summary });
    }
    stats.reverse();
    const totalHours = stats.reduce((sum, s) => sum + s.totalHours, 0);
    return {
      monthlyStats: stats,
      totalStats: {
        totalHours,
        totalEarnings: stats.reduce((sum, s) => sum + s.totalEarnings, 0),
        averageMonthlyHours: stats.length > 0 ? totalHours / stats.length : 0
      }
    };
  }

  static getMonthName(month: number): string {
    return MONTH_NAMES[month - 1] || 'Unbekannt';
  }

  /**
   * Überlappungsfreie Abrechnungsperioden für die Auswahl (inkl. Kennzeichen `isClosed`).
   * Fällt die Berechnung aus, gibt es Kalendermonate als Ersatz.
   */
  static async generateBillingPeriods(userId: number, monthsBack = 12, monthsForward = 3): Promise<PeriodOption[]> {
    try {
      const user = db().select({ start: users.abrechnungStart, end: users.abrechnungEnde }).from(users).where(eq(users.id, userId)).get();
      const startDay = user?.start || 1;
      const endDay = user?.end || 31;

      const now = new Date();
      // Für periodenübergreifende Abrechnungen (22.–21.): Starte früher
      const baseMonth = startDay > endDay ? now.getMonth() - 1 : now.getMonth();

      const periods: PeriodOption[] = [];
      for (let i = monthsBack; i > 0; i--) {
        periods.push(this.createPeriodObjectForUser(new Date(now.getFullYear(), baseMonth - i, 15), startDay, endDay));
      }
      periods.push(this.createPeriodObjectForUser(new Date(now.getFullYear(), baseMonth, 15), startDay, endDay));
      for (let i = 1; i <= monthsForward; i++) {
        periods.push(this.createPeriodObjectForUser(new Date(now.getFullYear(), baseMonth + i, 15), startDay, endDay));
      }

      const unique = periods.filter((p, index, self) => index === self.findIndex((q) => q.value === p.value));
      unique.sort((a, b) => a.startDate.localeCompare(b.startDate));

      const closures = db().select().from(periodClosures).where(eq(periodClosures.userId, userId)).all();
      unique.forEach((p) => {
        p.isClosed = closures.some((c) => overlaps(p.startDate, p.endDate, c.periodStart, c.periodEnd));
      });
      return unique;
    } catch (error) {
      logger.error({ err: error, userId }, 'Abrechnungsperioden konnten nicht erzeugt werden – Kalendermonate als Ersatz');
      return this.generateStandardBillingPeriods(monthsBack, monthsForward);
    }
  }

  /**
   * Perioden-Objekt für einen Mitarbeiter. Periodenübergreifende Abrechnungen werden nach dem Endmonat benannt
   * (22.7.–21.8. → "August"), monatsinterne nach dem Referenzmonat. `isCurrent`: heutiger Berliner Kalendertag
   * liegt in der Periode.
   */
  static createPeriodObjectForUser(date: Date, startDay: number, endDay: number): PeriodOption {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const billingPeriod = DateService.createBillingPeriod(startDay, endDay, referenceDate(year, month));

    let displayYear = year;
    let displayMonth = month;
    if (startDay > endDay) {
      const endDate = new Date(`${billingPeriod.endDate}T12:00:00.000Z`);
      displayYear = endDate.getUTCFullYear();
      displayMonth = endDate.getUTCMonth() + 1;
    }
    const displayMonthName = this.getMonthName(displayMonth);

    const today = todayString();
    return {
      // Value bleibt der Referenzmonat – das Backend berechnet daraus die Periode
      value: `${year}-${String(month).padStart(2, '0')}`,
      label: `${displayMonthName} ${displayYear} (${DateService.formatDateForDisplay(billingPeriod.startDate)} – ${DateService.formatDateForDisplay(billingPeriod.endDate)})`,
      year: displayYear,
      month: displayMonth,
      monthName: displayMonthName,
      startDate: billingPeriod.startDate,
      endDate: billingPeriod.endDate,
      referenceMonth: month,
      referenceYear: year,
      isCurrent: today >= billingPeriod.startDate && today <= billingPeriod.endDate
    };
  }

  /** Ersatz: Kalendermonate */
  static generateStandardBillingPeriods(monthsBack = 12, monthsForward = 3): PeriodOption[] {
    const now = new Date();
    const periods: PeriodOption[] = [];
    for (let i = -monthsBack; i <= monthsForward; i++) {
      periods.push(this.createPeriodObject(new Date(now.getFullYear(), now.getMonth() + i, 1)));
    }
    return periods;
  }

  /** Kalendermonat als Periode (Monatsende UTC-sicher über createBillingPeriod) */
  static createPeriodObject(date: Date): PeriodOption {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = this.getMonthName(month);
    const { startDate, endDate } = DateService.createBillingPeriod(1, 31, referenceDate(year, month));
    const today = todayString();
    return {
      value: `${year}-${String(month).padStart(2, '0')}`,
      label: `${monthName} ${year} (${DateService.formatDateForDisplay(startDate)} – ${DateService.formatDateForDisplay(endDate)})`,
      year,
      month,
      monthName,
      startDate,
      endDate,
      isCurrent: today >= startDate && today <= endDate
    };
  }
}

export default TimeEntryService;
