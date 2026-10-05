import { and, asc, between, count, desc, eq } from 'drizzle-orm';
import { db, transaction } from '../db/client';
import { periodClosures, timeEntries, users, type PeriodClosure } from '../db/schema';
import { AppError } from '../lib/errors';
import * as billing from '../utils/billing';
import { todayString } from '../utils/clock';
import { AuditService, type Actor } from './auditService';
import { DateService } from './dateService';
import { overlaps } from './periodGuard';
import { TimeEntryService } from './timeEntryService';

const MIN_REASON_LENGTH = 5;

/** Zeile der Monatsübersicht (Beträge in Euro) */
export interface TimesheetOverviewRow {
  userId: number;
  name: string;
  email: string;
  isActive: boolean;
  periodStart: string;
  periodEnd: string;
  entryCount: number;
  workDays: number;
  totalHours: number;
  totalEarnings: number;
  paidThisMonth: number;
  carryOut: number;
  minijobLimit: number;
  minijobLimitMissing: boolean;
  exceedsLimit: boolean;
  /** open: läuft noch · ready: beendet, abschließbar · closed: abgeschlossen */
  status: 'open' | 'ready' | 'closed';
  closedAt: Date | null;
}

const displayRange = (start: string, end: string): string =>
  `${DateService.formatDateForDisplay(start)} – ${DateService.formatDateForDisplay(end)}`;

/** Eingefrorene Zahlen eines Abschlusses für das Änderungsprotokoll (Beträge in Euro). */
const closureSnapshot = (closure: PeriodClosure) => ({
  periodStart: closure.periodStart,
  periodEnd: closure.periodEnd,
  entryCount: closure.entryCount,
  totalMinutes: closure.totalMinutes,
  earnings: billing.toEuros(closure.earningsCents),
  limit: billing.toEuros(closure.limitCents),
  carryIn: billing.toEuros(closure.carryInCents),
  paid: billing.toEuros(closure.paidCents),
  carryOut: billing.toEuros(closure.carryOutCents)
});

/** Zielperiode des Mitarbeiters für einen Referenzmonat (nach seinen aktuellen Einstellungen). */
const resolveTarget = (userId: number, year: number, month: number) => {
  const user = db().select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  const startDay = user.abrechnungStart || 1;
  const endDay = user.abrechnungEnde || 31;
  const target = DateService.createBillingPeriod(startDay, endDay, `${year}-${String(month).padStart(2, '0')}-15`);
  return { user, startDay, endDay, target };
};

const closuresOf = (userId: number): PeriodClosure[] =>
  db().select().from(periodClosures).where(eq(periodClosures.userId, userId)).orderBy(asc(periodClosures.periodStart)).all();

/**
 * Monatsabschluss: Eine Abrechnungsperiode eines Mitarbeiters wird festgeschrieben.
 *
 * Regeln:
 * - abschließen erst nach Periodenende und nur, wenn frühere Perioden mit Einträgen
 *   bereits abgeschlossen sind (der Übertrag baut aufeinander auf);
 * - wieder öffnen nur mit Begründung und nur die jüngste abgeschlossene Periode;
 * - beides steht im Änderungsprotokoll, Zahlen werden beim Abschluss eingefroren.
 */
export class PeriodService {
  /** Schließt eine Periode ab (Referenzmonat 1-12). */
  static async closePeriod(userId: number, year: number, month: number, actor: Actor): Promise<PeriodClosure> {
    return transaction(() => {
      const { startDay, endDay, target } = resolveTarget(userId, year, month);

      if (todayString() <= target.endDate) {
        throw new AppError('PERIOD_NOT_ENDED',
          `Die Periode ${displayRange(target.startDate, target.endDate)} läuft noch ` +
          'und kann erst nach ihrem Ende abgeschlossen werden'
        );
      }

      const closures = closuresOf(userId);
      if (closures.some((c) => c.periodStart === target.startDate && c.periodEnd === target.endDate)) {
        throw new AppError('PERIOD_ALREADY_CLOSED', 'Diese Periode ist bereits abgeschlossen');
      }
      if (closures.some((c) => overlaps(target.startDate, target.endDate, c.periodStart, c.periodEnd))) {
        throw new AppError('PERIOD_OVERLAP',
          'Die Periode überschneidet sich mit einer bereits abgeschlossenen Periode ' +
          '(Abrechnungszeitraum des Mitarbeiters wurde geändert). Bitte zuerst die überschneidende Periode öffnen.'
        );
      }

      // Frühere Perioden mit Einträgen müssen vorher abgeschlossen sein
      const periods = TimeEntryService.listPeriodsUpTo(userId, startDay, endDay, year, month);
      for (const earlier of periods.slice(0, -1)) {
        if (closures.some((c) => overlaps(earlier.startDate, earlier.endDate, c.periodStart, c.periodEnd))) continue;
        const entries = db().select({ n: count() }).from(timeEntries)
          .where(and(eq(timeEntries.userId, userId), between(timeEntries.date, earlier.startDate, earlier.endDate)))
          .get()?.n ?? 0;
        if (entries > 0) {
          throw new AppError('PERIOD_PREVIOUS_OPEN',
            `Bitte zuerst die frühere Periode ${displayRange(earlier.startDate, earlier.endDate)} abschließen`
          );
        }
      }

      const data = TimeEntryService.getMonthlyTimeRecordsSync(userId, year, month);
      const s = data.summary;
      if (s.minijobLimitMissing) {
        throw new AppError('MINIJOB_LIMIT_MISSING',
          'Für diese Periode (oder eine frühere offene Periode im Übertrag) ist keine ' +
          'Minijob-Grenze hinterlegt. Bitte zuerst unter „Minijob“ eine Grenze für diesen Zeitraum anlegen.'
        );
      }

      const closure = db().insert(periodClosures).values({
        userId,
        periodStart: target.startDate,
        periodEnd: target.endDate,
        closedBy: actor?.id ?? null,
        closedAt: new Date(),
        entryCount: s.entryCount,
        totalMinutes: data.records.reduce((sum, r) => sum + r.workMinutes, 0),
        earningsCents: billing.toCents(s.totalEarnings),
        limitCents: billing.toCents(s.minijobLimit),
        carryInCents: billing.toCents(s.carryIn),
        paidCents: billing.toCents(s.paidThisMonth),
        carryOutCents: billing.toCents(s.carryOut)
      }).returning().get();

      AuditService.record({
        actor,
        action: 'period.close',
        entityType: 'PeriodClosure',
        entityId: closure.id,
        targetUserId: userId,
        after: closureSnapshot(closure)
      });
      return closure;
    });
  }

  /** Öffnet eine abgeschlossene Periode wieder (nur mit Begründung, nur die jüngste). */
  static async reopenPeriod(userId: number, year: number, month: number, reason: string, actor: Actor) {
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < MIN_REASON_LENGTH) {
      throw new AppError('REASON_REQUIRED', `Bitte eine Begründung angeben (mindestens ${MIN_REASON_LENGTH} Zeichen)`);
    }

    return transaction(() => {
      const { target } = resolveTarget(userId, year, month);
      const closures = closuresOf(userId);
      const closure = closures.find((c) => overlaps(target.startDate, target.endDate, c.periodStart, c.periodEnd));
      if (!closure) {
        throw new AppError('PERIOD_NOT_CLOSED', 'Diese Periode ist nicht abgeschlossen');
      }
      const later = closures.find((c) => c.periodStart > closure.periodStart);
      if (later) {
        throw new AppError('PERIOD_LATER_CLOSED',
          `Zuerst die später abgeschlossene Periode ${displayRange(later.periodStart, later.periodEnd)} wieder öffnen`
        );
      }

      db().delete(periodClosures).where(eq(periodClosures.id, closure.id)).run();
      AuditService.record({
        actor,
        action: 'period.reopen',
        entityType: 'PeriodClosure',
        entityId: closure.id,
        targetUserId: userId,
        before: closureSnapshot(closure),
        meta: { reason: cleanReason }
      });
      return { periodStart: closure.periodStart, periodEnd: closure.periodEnd };
    });
  }

  /**
   * Übersicht aller Mitarbeiter für einen Referenzmonat: Stunden, Beträge und Status je Mitarbeiter (jeweils in
   * dessen eigener Abrechnungsperiode). Deaktivierte Konten erscheinen nur, wenn sie in der Periode Einträge haben.
   * @param month Referenzmonat (1-12)
   */
  static overview(year: number, month: number): TimesheetOverviewRow[] {
    const employees = db().select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
      .from(users)
      .where(eq(users.role, 'mitarbeiter'))
      .orderBy(asc(users.name))
      .all();
    const today = todayString();
    const rows: TimesheetOverviewRow[] = [];
    for (const employee of employees) {
      const isActive = employee.isActive !== false;
      const data = TimeEntryService.getMonthlyTimeRecordsSync(employee.id, year, month);
      const s = data.summary;
      if (!isActive && s.entryCount === 0) continue;
      const closed = data.period.status === 'closed';
      rows.push({
        userId: employee.id,
        name: employee.name,
        email: employee.email,
        isActive,
        periodStart: data.period.startDate,
        periodEnd: data.period.endDate,
        entryCount: s.entryCount,
        workDays: s.workDays,
        totalHours: s.totalHours,
        totalEarnings: s.totalEarnings,
        paidThisMonth: s.paidThisMonth,
        carryOut: s.carryOut,
        minijobLimit: s.minijobLimit,
        // Abgeschlossene Perioden rechnen mit der eingefrorenen Grenze – dort fehlt nichts
        minijobLimitMissing: !closed && s.minijobLimitMissing,
        exceedsLimit: s.exceedsLimit,
        status: closed ? 'closed' : today > data.period.endDate ? 'ready' : 'open',
        closedAt: data.closure ? data.closure.closedAt : null
      });
    }
    return rows;
  }

  /** Alle aktuell abgeschlossenen Perioden eines Mitarbeiters (neueste zuerst). */
  static async listClosures(userId: number): Promise<PeriodClosure[]> {
    return db().select().from(periodClosures).where(eq(periodClosures.userId, userId)).orderBy(desc(periodClosures.periodStart)).all();
  }
}

export default PeriodService;
