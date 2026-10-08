import { and, asc, between, eq, sql } from 'drizzle-orm';
import { db, transaction } from '../db/client';
import { specialItems, users, type SpecialItemRow } from '../db/schema';
import { AppError } from '../lib/errors';
import * as billing from '../utils/billing';
import { todayString } from '../utils/clock';
import { AuditService, type Actor } from './auditService';
import { assertDateOpen, nextOpenPeriodFor } from './periodGuard';

/** API-Form eines Sonderpostens (Betrag in Cent und Euro) */
export interface SpecialItemJSON extends SpecialItemRow {
  amount: number;
}

export interface SpecialItemInput {
  date: string;
  description: string;
  amount: number;
}

/** Datum, nach dem ein Sonderposten einer Periode zugeordnet wird (wie bei Zeiteinträgen) */
export const specialItemBillingDateSql = sql<string>`coalesce(${specialItems.billingDate}, ${specialItems.date})`;
const billingDateOf = (item: Pick<SpecialItemRow, 'date' | 'billingDate'>): string => item.billingDate ?? item.date;

export const toSpecialItemJSON = (item: SpecialItemRow): SpecialItemJSON => ({ ...item, amount: billing.toEuros(item.amountCents) });

const snapshot = (item: SpecialItemRow) => ({
  date: item.date,
  description: item.description,
  amount: billing.toEuros(item.amountCents),
  ...(item.billingDate && { billingDate: item.billingDate })
});

const findItem = (userId: number, itemId: number): SpecialItemRow => {
  const item = db().select().from(specialItems)
    .where(and(eq(specialItems.id, itemId), eq(specialItems.userId, userId)))
    .get();
  if (!item) throw new AppError('SPECIAL_ITEM_NOT_FOUND', 'Sonderposten nicht gefunden');
  return item;
};

/** Kaufdatum prüfen; liegt es in einer abgeschlossenen Periode, wird der Posten Nachtrag in der nächsten offenen. */
const resolveBillingDate = (userId: number, date: string): string | null => {
  if (date > todayString()) {
    throw new AppError('VALIDATION_ERROR', 'Datum darf nicht in der Zukunft liegen', { fields: { date: 'Datum darf nicht in der Zukunft liegen' } });
  }
  return nextOpenPeriodFor(userId, date)?.startDate ?? null;
};

/** Abrechnungsdatum des frühesten Sonderpostens vor `before` (für die Periodenliste im Übertrag), sonst undefined */
export const firstSpecialItemBefore = (userId: number, before: string): string | undefined =>
  db().select({ date: specialItemBillingDateSql }).from(specialItems)
    .where(and(eq(specialItems.userId, userId), sql`${specialItemBillingDateSql} < ${before}`))
    .orderBy(asc(specialItemBillingDateSql))
    .get()?.date;

/**
 * Sonderposten: privat verauslagte Beträge eines Mitarbeiters, die mit dem Lohn ausgezahlt werden. Sie zählen wie der
 * Verdienst gegen die Minijob-Grenze; was darüber liegt, geht in den Übertrag. Nur Admins erfassen sie; in
 * abgeschlossenen Perioden sind sie gesperrt (Kaufdatum dort → Nachtrag in der nächsten offenen Periode).
 */
export class SpecialItemService {
  /** Sonderposten, die in der Periode [startDate, endDate] abgerechnet werden (nach Kaufdatum sortiert) */
  static listForPeriod(userId: number, startDate: string, endDate: string): SpecialItemRow[] {
    return db().select().from(specialItems)
      .where(and(eq(specialItems.userId, userId), between(specialItemBillingDateSql, startDate, endDate)))
      .orderBy(asc(specialItems.date), asc(specialItems.id))
      .all();
  }

  static create(userId: number, input: SpecialItemInput, actor: Actor): SpecialItemJSON {
    return transaction(() => {
      if (!db().select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) {
        throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
      }
      const created = db().insert(specialItems).values({
        userId,
        date: input.date,
        description: input.description,
        amountCents: billing.toCents(input.amount),
        billingDate: resolveBillingDate(userId, input.date),
        createdBy: actor?.id ?? null
      }).returning().get();
      AuditService.record({
        actor,
        action: 'special_item.create',
        entityType: 'SpecialItem',
        entityId: created.id,
        targetUserId: userId,
        after: snapshot(created)
      });
      return toSpecialItemJSON(created);
    });
  }

  static update(userId: number, itemId: number, input: Partial<SpecialItemInput>, actor: Actor): SpecialItemJSON {
    return transaction(() => {
      const item = findItem(userId, itemId);
      assertDateOpen(userId, billingDateOf(item));
      const date = input.date ?? item.date;
      const updated = db().update(specialItems).set({
        date,
        billingDate: date === item.date ? item.billingDate : resolveBillingDate(userId, date),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.amount !== undefined && { amountCents: billing.toCents(input.amount) })
      }).where(eq(specialItems.id, item.id)).returning().get();
      AuditService.record({
        actor,
        action: 'special_item.update',
        entityType: 'SpecialItem',
        entityId: item.id,
        targetUserId: userId,
        before: snapshot(item),
        after: snapshot(updated)
      });
      return toSpecialItemJSON(updated);
    });
  }

  static delete(userId: number, itemId: number, actor: Actor): void {
    transaction(() => {
      const item = findItem(userId, itemId);
      assertDateOpen(userId, billingDateOf(item));
      db().delete(specialItems).where(eq(specialItems.id, item.id)).run();
      AuditService.record({
        actor,
        action: 'special_item.delete',
        entityType: 'SpecialItem',
        entityId: item.id,
        targetUserId: userId,
        before: snapshot(item)
      });
    });
  }

  /** Erste noch nicht abgerechnete Periode vor `before` mit Sonderposten (für den Monatsabschluss), sonst undefined */
  static firstOpenBefore(userId: number, before: string, isClosed: (date: string) => boolean): string | undefined {
    return db().select({ date: specialItemBillingDateSql }).from(specialItems)
      .where(and(eq(specialItems.userId, userId), sql`${specialItemBillingDateSql} < ${before}`))
      .orderBy(asc(specialItemBillingDateSql))
      .all()
      .map((row) => row.date)
      .find((date) => !isClosed(date));
  }
}

export default SpecialItemService;
