/**
 * Nachträge: Einträge für Tage in bereits abgeschlossenen Perioden werden in der nächsten offenen Periode abgerechnet.
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { closeDb, initDatabase } from '../src/db';
import { db } from '../src/db/client';
import { timeEntries, type User } from '../src/db/schema';
import { AuditService } from '../src/services/auditService';
import { PayslipService } from '../src/services/payslipService';
import { nextOpenPeriodFor } from '../src/services/periodGuard';
import { PeriodService } from '../src/services/periodService';
import { TimeEntryService } from '../src/services/timeEntryService';
import { todayString } from '../src/utils/clock';
import { renderPayslipsPdf } from '../src/utils/payslipPdf';
import { actorOf, addEntry, addLimit, makeUser as createUser, reject } from './helpers';

const makeUser = (patch: Partial<User> = {}) => createUser({ name: 'Nachtrag Test', stundenlohn: 10, ...patch }, 'nachtrag');
const markLate = (entryId: number, billingDate: string) =>
  db().update(timeEntries).set({ billingDate }).where(eq(timeEntries.id, entryId)).returning().get();

const pad = (n: number) => String(n).padStart(2, '0');
const months = () => {
  const [y = 0, m = 1] = todayString().split('-').map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  return {
    current: { year: y, month: m, first: `${y}-${pad(m)}-01` },
    prev: { year: prevYear, month: prevMonth, first: `${prevYear}-${pad(prevMonth)}-01`, last: `${prevYear}-${pad(prevMonth)}-${pad(lastDay)}` }
  };
};

let admin: User;

test.before(async () => {
  await initDatabase();
  admin = await makeUser({ role: 'admin' });
  addLimit(admin.id, 1000, '2024-01-01', null, 'Grenze 1000 €');
});

test.after(() => {
  closeDb();
});

test('Nachtrag: Tag im abgeschlossenen Vormonat wird im laufenden Monat abgerechnet, der Abschluss bleibt unverändert', async () => {
  const user = await makeUser();
  const { prev, current } = months();
  addEntry(user, prev.first, { start: '09:00', end: '13:00' }); // 40 €
  const closure = await PeriodService.closePeriod(user.id, prev.year, prev.month, actorOf(admin));

  const late = await TimeEntryService.createTimeEntry(
    { userId: user.id, date: prev.last, startTime: '08:00', endTime: '10:00', breakMinutes: 0 },
    actorOf(user)
  );
  assert.equal(late.date, prev.last, 'Arbeitstag bleibt erhalten');
  assert.equal(late.billingDate, current.first, 'abgerechnet ab Beginn der nächsten offenen Periode');

  const closedMonth = await TimeEntryService.getMonthlyTimeRecords(user.id, prev.year, prev.month);
  assert.equal(closedMonth.records.length, 1, 'abgeschlossener Monat zeigt den Nachtrag nicht');
  assert.equal(closedMonth.summary.totalEarnings, 40);
  assert.equal(PayslipService.forClosure(user.id, closure.id).entries.length, 1, 'Lohnzettel des Abschlusses unverändert');

  const open = await TimeEntryService.getMonthlyTimeRecords(user.id, current.year, current.month);
  assert.deepEqual(open.records.map((r) => [r.date, r.billingDate]), [[prev.last, current.first]]);
  assert.equal(open.summary.totalEarnings, 20);
  assert.equal(open.summary.entryCount, 1);

  const [created] = (await AuditService.list({ userId: user.id, action: 'time_entry.create' })).entries;
  assert.equal((created?.after as { billingDate?: string })?.billingDate, current.first, 'Protokoll hält den Nachtrag fest');
});

test('Nachtrag: solange die Abrechnungsperiode offen ist, änder- und löschbar; danach gesperrt', async () => {
  const user = await makeUser();
  const { prev } = months();
  addEntry(user, prev.first);
  await PeriodService.closePeriod(user.id, prev.year, prev.month, actorOf(admin));

  const late = await TimeEntryService.createTimeEntry(
    { userId: user.id, date: prev.last, startTime: '08:00', endTime: '10:00', breakMinutes: 0 },
    actorOf(user)
  );
  const updated = await TimeEntryService.updateTimeEntry(late.id, { endTime: '11:00' }, user.id, actorOf(user));
  assert.equal(updated.endTime, '11:00');
  assert.equal(updated.billingDate, late.billingDate, 'bleibt Nachtrag');
  assert.equal(await TimeEntryService.deleteTimeEntry(late.id, user.id, actorOf(user)), true);

  // Nachtrag, dessen Abrechnungsperiode ebenfalls abgeschlossen ist
  const old = await makeUser();
  addEntry(old, '2024-06-03');
  const lateOld = markLate(addEntry(old, '2024-06-28', { start: '09:00', end: '10:00' }).id, '2024-07-01');
  await PeriodService.closePeriod(old.id, 2024, 6, actorOf(admin));
  await PeriodService.closePeriod(old.id, 2024, 7, actorOf(admin));
  await reject(TimeEntryService.updateTimeEntry(lateOld.id, { endTime: '11:00' }, old.id, actorOf(old)), /PERIOD_CLOSED.*01\.07\.2024/);
  await reject(TimeEntryService.deleteTimeEntry(lateOld.id, old.id, actorOf(old)), /PERIOD_CLOSED/);
});

test('Nachtrag: nächste offene Periode überspringt abgeschlossene Monate und beachtet monatsübergreifende Zeiträume', async () => {
  const user = await makeUser();
  addEntry(user, '2024-03-04');
  addEntry(user, '2024-04-04');
  await PeriodService.closePeriod(user.id, 2024, 3, actorOf(admin));
  await PeriodService.closePeriod(user.id, 2024, 4, actorOf(admin));
  assert.equal(nextOpenPeriodFor(user.id, '2024-03-20')?.startDate, '2024-05-01');
  assert.equal(nextOpenPeriodFor(user.id, '2024-05-20'), undefined, 'offene Periode: kein Nachtrag');

  const shifted = await makeUser({ abrechnungStart: 22, abrechnungEnde: 21 });
  addEntry(shifted, '2024-03-25'); // Periode 22.03.–21.04.
  await PeriodService.closePeriod(shifted.id, 2024, 3, actorOf(admin));
  assert.deepEqual(
    [nextOpenPeriodFor(shifted.id, '2024-04-10')?.startDate, nextOpenPeriodFor(shifted.id, '2024-04-10')?.endDate],
    ['2024-04-22', '2024-05-21']
  );
  assert.equal(nextOpenPeriodFor(shifted.id, '2024-03-21'), undefined, 'Tag vor der abgeschlossenen Periode');
});

test('Nachtrag: zählt im Abschluss und Lohnzettel der Periode, in der er abgerechnet wird', async () => {
  const user = await makeUser({ name: 'Nora Nachtrag' });
  addEntry(user, '2024-08-05', { start: '09:00', end: '13:00' }); // 40 €
  await PeriodService.closePeriod(user.id, 2024, 8, actorOf(admin));
  addEntry(user, '2024-09-02', { start: '09:00', end: '11:00' }); // 20 €
  markLate(addEntry(user, '2024-08-30', { start: '09:00', end: '12:00' }).id, '2024-09-01'); // 30 €

  const closure = await PeriodService.closePeriod(user.id, 2024, 9, actorOf(admin));
  assert.equal(closure.entryCount, 2);
  assert.equal(closure.earningsCents, 5000);
  assert.equal(closure.totalMinutes, 300);

  const payslip = PayslipService.forMonth(user.id, 2024, 9);
  assert.deepEqual(payslip.entries.map((e) => [e.date, e.billingDate]), [['2024-08-30', '2024-09-01'], ['2024-09-02', null]]);
  assert.equal(PayslipService.forMonth(user.id, 2024, 8).entries.length, 1);

  const pdf = (await renderPayslipsPdf([payslip])).toString('latin1');
  assert.ok(pdf.startsWith('%PDF'));
});

test('Nachtrag: frühere offene Periode mit Nachtrag muss vor der späteren abgeschlossen werden', async () => {
  const user = await makeUser();
  addEntry(user, '2024-10-07');
  await PeriodService.closePeriod(user.id, 2024, 10, actorOf(admin));
  markLate(addEntry(user, '2024-10-30').id, '2024-11-01'); // November hat nur den Nachtrag
  addEntry(user, '2024-12-02');
  await reject(PeriodService.closePeriod(user.id, 2024, 12, actorOf(admin)), /PERIOD_PREVIOUS_OPEN.*01\.11\.2024/);
});
