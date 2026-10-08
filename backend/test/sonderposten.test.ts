/**
 * Sonderposten: privat verauslagte Beträge, zusätzlich zum Lohn erstattet (außerhalb von Grenze und Übertrag).
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { closeDb, initDatabase } from '../src/db';
import type { User } from '../src/db/schema';
import { AuditService } from '../src/services/auditService';
import { PayslipService } from '../src/services/payslipService';
import { PeriodService } from '../src/services/periodService';
import { SpecialItemService } from '../src/services/specialItemService';
import { TimeEntryService } from '../src/services/timeEntryService';
import { UserService } from '../src/services/userService';
import { renderPayslipsPdf } from '../src/utils/payslipPdf';
import { actorOf, addEntry, addLimit, makeUser as createUser, reject } from './helpers';

const makeUser = (patch: Partial<User> = {}) => createUser({ name: 'Sonder Test', stundenlohn: 10, ...patch }, 'sonder');
const pageCount = (pdf: Buffer): number => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

let admin: User;

test.before(async () => {
  await initDatabase();
  admin = await makeUser({ role: 'admin' });
  addLimit(admin.id, 100, '2024-01-01', null, 'Grenze 100 €');
});

test.after(() => {
  closeDb();
});

test('Sonderposten: zusätzlich zum Lohn ausgezahlt, ohne Einfluss auf Grenze und Übertrag; im Abschluss eingefroren', async () => {
  const user = await makeUser();
  addEntry(user, '2024-03-04', { start: '08:00', end: '20:00', rateCents: 1000 }); // 12 h → 120 €
  SpecialItemService.create(user.id, { date: '2024-03-11', description: 'Leuchtmittel Treppenhaus', amount: 23.9 }, actorOf(admin));
  SpecialItemService.create(user.id, { date: '2024-03-23', description: 'Nachschlüssel', amount: 23.95 }, actorOf(admin));
  SpecialItemService.create(user.id, { date: '2024-04-02', description: 'Andere Periode', amount: 5 }, actorOf(admin));

  const data = TimeEntryService.getMonthlyTimeRecordsSync(user.id, 2024, 3);
  assert.deepEqual(data.specialItems.map((i) => [i.date, i.amount]), [['2024-03-11', 23.9], ['2024-03-23', 23.95]]);
  assert.equal(data.summary.paidThisMonth, 100, 'Lohn höchstens die Grenze');
  assert.equal(data.summary.carryOut, 20, 'Sonderposten gehen nicht in den Übertrag');
  assert.equal(data.summary.specialItemsTotal, 47.85);
  assert.equal(data.summary.payout, 147.85);

  const closure = await PeriodService.closePeriod(user.id, 2024, 3, actorOf(admin));
  assert.equal(closure.specialItemsCents, 4785);
  assert.equal(closure.paidCents, 10000);

  const payslip = PayslipService.forMonth(user.id, 2024, 3);
  assert.equal(payslip.totals.specialItemsCents, 4785);
  assert.deepEqual(payslip.specialItems.map((i) => i.description), ['Leuchtmittel Treppenhaus', 'Nachschlüssel']);
  const [listed] = PayslipService.listForUser(user.id);
  assert.deepEqual([listed?.paid, listed?.specialItems, listed?.payout], [100, 47.85, 147.85]);

  const row = PeriodService.overview(2024, 3).find((r) => r.userId === user.id);
  assert.deepEqual([row?.specialItemsTotal, row?.payout], [47.85, 147.85]);

  const pdf = await renderPayslipsPdf([payslip]);
  assert.equal(pageCount(pdf), 1);
});

test('Sonderposten: in abgeschlossener Periode gesperrt, neues Kaufdatum dort wird Nachtrag in der nächsten offenen', async () => {
  const user = await makeUser();
  addEntry(user, '2024-05-06');
  const item = SpecialItemService.create(user.id, { date: '2024-05-07', description: 'Schrauben', amount: 4.5 }, actorOf(admin));
  await PeriodService.closePeriod(user.id, 2024, 5, actorOf(admin));

  assert.throws(() => SpecialItemService.update(user.id, item.id, { amount: 5 }, actorOf(admin)), { code: 'PERIOD_CLOSED' });
  assert.throws(() => SpecialItemService.delete(user.id, item.id, actorOf(admin)), { code: 'PERIOD_CLOSED' });

  const late = SpecialItemService.create(user.id, { date: '2024-05-20', description: 'Farbe', amount: 12 }, actorOf(admin));
  assert.equal(late.billingDate, '2024-06-01');
  const june = TimeEntryService.getMonthlyTimeRecordsSync(user.id, 2024, 6);
  assert.deepEqual(june.specialItems.map((i) => i.id), [late.id]);
  assert.equal(june.summary.payout, 12);

  // Nur Sonderposten (ohne Zeiten) reichen für einen Abschluss
  const closure = await PeriodService.closePeriod(user.id, 2024, 6, actorOf(admin));
  assert.equal(closure.specialItemsCents, 1200);
  const pdf = await renderPayslipsPdf([PayslipService.forMonth(user.id, 2024, 6)]);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('Sonderposten: Ändern/Löschen im Protokoll, fremde Posten nicht gefunden, frühere offene Periode blockiert den Abschluss', async () => {
  const user = await makeUser();
  const other = await makeUser();
  const item = SpecialItemService.create(user.id, { date: '2024-07-03', description: 'Besen', amount: 9.99 }, actorOf(admin));

  assert.throws(() => SpecialItemService.update(other.id, item.id, { amount: 1 }, actorOf(admin)), { code: 'SPECIAL_ITEM_NOT_FOUND' });
  const updated = SpecialItemService.update(user.id, item.id, { description: 'Besen und Schaufel', amount: 14.5 }, actorOf(admin));
  assert.deepEqual([updated.description, updated.amountCents], ['Besen und Schaufel', 1450]);

  // Juli enthält nur einen Sonderposten: August kann erst nach Juli abgeschlossen werden
  addEntry(user, '2024-08-05');
  await reject(PeriodService.closePeriod(user.id, 2024, 8, actorOf(admin)), /PERIOD_PREVIOUS_OPEN.*01\.07\.2024/);

  await reject(UserService.deleteUser(user.id, actorOf(admin)), /USER_HAS_DEPENDENCIES.*Sonderposten/);

  SpecialItemService.delete(user.id, item.id, actorOf(admin));
  await PeriodService.closePeriod(user.id, 2024, 8, actorOf(admin));

  const { entries } = await AuditService.list({ userId: user.id, action: 'special_item' });
  assert.deepEqual(entries.map((e) => e.action).sort(), ['special_item.create', 'special_item.delete', 'special_item.update']);

  assert.throws(() => SpecialItemService.create(user.id, { date: '2999-01-01', description: 'Zukunft', amount: 1 }, actorOf(admin)),
    { code: 'VALIDATION_ERROR' });
});
