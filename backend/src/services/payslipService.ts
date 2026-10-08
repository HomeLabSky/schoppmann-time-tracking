import { and, asc, between, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { periodClosures, timeEntries, users, type PeriodClosure, type User } from '../db/schema';
import { AppError } from '../lib/errors';
import { toTimeEntryJSON } from '../models/timeEntry';
import * as billing from '../utils/billing';
import type { Payslip } from '../utils/payslipPdf';
import { DateService } from './dateService';
import { billingDateSql, overlaps } from './periodGuard';
import { SpecialItemService } from './specialItemService';
import { TimeEntryService } from './timeEntryService';

/** Eintrag der Lohnzettel-Liste eines Mitarbeiters (Beträge in Euro) */
export interface PayslipListItem {
  id: number;
  label: string;
  periodStart: string;
  periodEnd: string;
  closedAt: Date;
  totalHours: number;
  earnings: number;
  paid: number;
  specialItems: number;
  payout: number;
  carryOut: number;
}

/**
 * Benennung wie in der Periodenauswahl: Perioden innerhalb eines Monats nach diesem Monat, monatsübergreifende
 * (z. B. 22.07.–21.08.) nach dem Endmonat.
 */
export const periodLabel = (endDate: string): string => {
  const [year = 0, month = 1] = endDate.split('-').map(Number);
  return `${TimeEntryService.getMonthName(month)} ${year}`;
};

const loadUser = (userId: number): User => {
  const user = db().select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  return user;
};

/** Abschluss, der die Periode des Mitarbeiters zum Referenzmonat abdeckt (nach seinen aktuellen Einstellungen). */
const closureForMonth = (user: User, year: number, month: number): PeriodClosure | undefined => {
  const target = DateService.createBillingPeriod(
    user.abrechnungStart || 1,
    user.abrechnungEnde || 31,
    `${year}-${String(month).padStart(2, '0')}-15`
  );
  return db().select().from(periodClosures).where(eq(periodClosures.userId, user.id)).all()
    .find((c) => overlaps(target.startDate, target.endDate, c.periodStart, c.periodEnd));
};

const build = (user: User, closure: PeriodClosure): Payslip => {
  // Die Periode ist gesperrt: Die Einträge entsprechen genau den eingefrorenen Summen des Abschlusses
  // (Zuordnung nach Abrechnungsdatum – Nachträge stehen in der Periode, in der sie abgerechnet wurden)
  const entries = db().select().from(timeEntries)
    .where(and(eq(timeEntries.userId, user.id), between(billingDateSql, closure.periodStart, closure.periodEnd)))
    .orderBy(asc(timeEntries.date), asc(timeEntries.startTime))
    .all()
    .map(toTimeEntryJSON);
  return {
    closureId: closure.id,
    employee: { id: user.id, name: user.name, email: user.email },
    period: { startDate: closure.periodStart, endDate: closure.periodEnd, label: periodLabel(closure.periodEnd) },
    closedAt: closure.closedAt,
    entries,
    specialItems: SpecialItemService.listForPeriod(user.id, closure.periodStart, closure.periodEnd)
      .map((item) => ({ date: item.date, description: item.description, amountCents: item.amountCents, billingDate: item.billingDate })),
    totals: {
      minutes: closure.totalMinutes,
      entryCount: closure.entryCount,
      workDays: new Set(entries.map((e) => e.date)).size,
      earningsCents: closure.earningsCents,
      carryInCents: closure.carryInCents,
      limitCents: closure.limitCents,
      paidCents: closure.paidCents,
      carryOutCents: closure.carryOutCents,
      specialItemsCents: closure.specialItemsCents
    }
  };
};

/**
 * Lohnzettel gibt es nur für abgeschlossene Perioden: Sie zeigen die beim Abschluss festgeschriebenen Zahlen.
 * Wird eine Periode wieder geöffnet, verschwindet ihr Lohnzettel, bis sie erneut abgeschlossen ist.
 */
export class PayslipService {
  /** Alle Lohnzettel eines Mitarbeiters (neueste zuerst). */
  static listForUser(userId: number): PayslipListItem[] {
    return db().select().from(periodClosures)
      .where(eq(periodClosures.userId, userId))
      .orderBy(desc(periodClosures.periodStart))
      .all()
      .map((c) => ({
        id: c.id,
        label: periodLabel(c.periodEnd),
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        closedAt: c.closedAt,
        totalHours: Math.round((c.totalMinutes / 60) * 100) / 100,
        earnings: billing.toEuros(c.earningsCents),
        paid: billing.toEuros(c.paidCents),
        specialItems: billing.toEuros(c.specialItemsCents),
        payout: billing.toEuros(c.paidCents + c.specialItemsCents),
        carryOut: billing.toEuros(c.carryOutCents)
      }));
  }

  /** Lohnzettel zu einem Abschluss – nur wenn er zu diesem Mitarbeiter gehört. */
  static forClosure(userId: number, closureId: number): Payslip {
    const user = loadUser(userId);
    const closure = db().select().from(periodClosures)
      .where(and(eq(periodClosures.id, closureId), eq(periodClosures.userId, userId)))
      .get();
    if (!closure) throw new AppError('PAYSLIP_NOT_FOUND', 'Lohnzettel nicht gefunden');
    return build(user, closure);
  }

  /** Lohnzettel eines Mitarbeiters für den Referenzmonat (1-12). */
  static forMonth(userId: number, year: number, month: number): Payslip {
    const user = loadUser(userId);
    const closure = closureForMonth(user, year, month);
    if (!closure) {
      throw new AppError('PAYSLIP_NOT_FOUND', 'Für diese Periode gibt es noch keinen Lohnzettel – sie ist nicht abgeschlossen');
    }
    return build(user, closure);
  }

  /**
   * Monatsabschluss: Lohnzettel aller Mitarbeiter mit abgeschlossener Periode zum Referenzmonat (1-12), nach Namen
   * sortiert. Mitarbeiter mit noch offener Periode fehlen; deaktivierte Konten erscheinen, wenn abgeschlossen.
   */
  static allForMonth(year: number, month: number): Payslip[] {
    const employees = db().select().from(users).where(eq(users.role, 'mitarbeiter')).orderBy(asc(users.name)).all();
    const payslips: Payslip[] = [];
    for (const employee of employees) {
      const closure = closureForMonth(employee, year, month);
      if (closure) payslips.push(build(employee, closure));
    }
    if (payslips.length === 0) {
      throw new AppError('PAYSLIP_NOT_FOUND', 'Für diesen Monat ist noch keine Periode abgeschlossen');
    }
    return payslips;
  }
}

export default PayslipService;
