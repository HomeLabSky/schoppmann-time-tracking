/**
 * Lohnzettel: Daten aus dem Monatsabschluss und PDF-Erzeugung.
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { closeDb, initDatabase } from '../src/db';
import type { User } from '../src/db/schema';
import { PayslipService } from '../src/services/payslipService';
import { PeriodService } from '../src/services/periodService';
import { payslipFilename, renderPayslipsPdf, toWinAnsi } from '../src/utils/payslipPdf';
import { actorOf, addEntry, addLimit, makeUser as createUser } from './helpers';

const makeUser = (patch: Partial<User> = {}) => createUser({ name: 'Lohn Test', stundenlohn: 10, ...patch }, 'payslip');
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

test('Lohnzettel: festgeschriebene Zahlen des Abschlusses und Einträge der Periode', async () => {
  const user = await makeUser({ name: 'Berta Beispiel' });
  addEntry(user, '2024-03-04', { start: '08:00', end: '12:00', rateCents: 1000 }); // 4 h → 40 €
  addEntry(user, '2024-03-05', { start: '08:00', end: '16:00', breakMinutes: 30, rateCents: 1000 }); // 7,5 h → 75 €
  addEntry(user, '2024-04-01', { start: '08:00', end: '09:00' }); // andere Periode
  const closure = await PeriodService.closePeriod(user.id, 2024, 3, actorOf(admin));

  const payslip = PayslipService.forMonth(user.id, 2024, 3);
  assert.equal(payslip.closureId, closure.id);
  assert.equal(payslip.employee.name, 'Berta Beispiel');
  assert.deepEqual(payslip.period, { startDate: '2024-03-01', endDate: '2024-03-31', label: 'März 2024' });
  assert.equal(payslip.entries.length, 2);
  assert.deepEqual(payslip.totals, {
    minutes: 690,
    entryCount: 2,
    workDays: 2,
    earningsCents: 11500,
    carryInCents: 0,
    limitCents: 10000,
    paidCents: 10000,
    carryOutCents: 1500,
    specialItemsCents: 0
  });
  assert.deepEqual(payslip.specialItems, []);

  assert.deepEqual(PayslipService.forClosure(user.id, closure.id).totals, payslip.totals);
  assert.deepEqual(PayslipService.listForUser(user.id).map((p) => [p.id, p.label, p.paid, p.carryOut, p.totalHours]), [
    [closure.id, 'März 2024', 100, 15, 11.5]
  ]);
});

test('Lohnzettel: nur für abgeschlossene Perioden und nur für den eigenen Abschluss', async () => {
  const user = await makeUser();
  const other = await makeUser();
  addEntry(user, '2024-05-06');
  addEntry(other, '2024-05-06');

  assert.throws(() => PayslipService.forMonth(user.id, 2024, 5), { code: 'PAYSLIP_NOT_FOUND' });
  assert.deepEqual(PayslipService.listForUser(user.id), []);

  const closure = await PeriodService.closePeriod(user.id, 2024, 5, actorOf(admin));
  assert.throws(() => PayslipService.forClosure(other.id, closure.id), { code: 'PAYSLIP_NOT_FOUND' }, 'fremder Abschluss');
  assert.throws(() => PayslipService.forClosure(user.id, 999999), { code: 'PAYSLIP_NOT_FOUND' });
  assert.throws(() => PayslipService.forMonth(999999, 2024, 5), { code: 'USER_NOT_FOUND' });

  // Wieder geöffnet → kein Lohnzettel mehr
  await PeriodService.reopenPeriod(user.id, 2024, 5, 'Korrektur der Endzeit', actorOf(admin));
  assert.throws(() => PayslipService.forMonth(user.id, 2024, 5), { code: 'PAYSLIP_NOT_FOUND' });
  assert.deepEqual(PayslipService.listForUser(user.id), []);
});

test('Lohnzettel: Monatsabschluss sammelt alle abgeschlossenen Mitarbeiter (nach Namen), eigene Perioden je Mitarbeiter', async () => {
  const zora = await makeUser({ name: 'Zora Zett' });
  const anton = await makeUser({ name: 'Anton Alt', abrechnungStart: 22, abrechnungEnde: 21 }); // 22.06.–21.07.
  const open = await makeUser({ name: 'Otto Offen' });
  addEntry(zora, '2024-06-10');
  addEntry(anton, '2024-07-01');
  addEntry(open, '2024-06-11');
  await PeriodService.closePeriod(zora.id, 2024, 6, actorOf(admin));
  await PeriodService.closePeriod(anton.id, 2024, 6, actorOf(admin));

  const all = PayslipService.allForMonth(2024, 6);
  assert.deepEqual(all.map((p) => p.employee.name), ['Anton Alt', 'Zora Zett'], 'offene Periode fehlt, sortiert nach Namen');
  assert.deepEqual(all.map((p) => [p.period.startDate, p.period.endDate, p.period.label]), [
    ['2024-06-22', '2024-07-21', 'Juli 2024'],
    ['2024-06-01', '2024-06-30', 'Juni 2024']
  ]);

  assert.throws(() => PayslipService.allForMonth(2023, 1), { code: 'PAYSLIP_NOT_FOUND' });
});

test('Lohnzettel-PDF: ein Lohnzettel je Seite, lange Nachweise laufen auf Folgeseiten weiter', async () => {
  const short = await makeUser({ name: 'Kurt Kurz' });
  const long = await makeUser({ name: 'Lena Lang' });
  addEntry(short, '2024-08-05');
  for (let day = 1; day <= 31; day++) {
    const date = `2024-08-${String(day).padStart(2, '0')}`;
    addEntry(long, date, { start: '06:00', end: '08:00' });
    addEntry(long, date, { start: '18:00', end: '19:00', breakMinutes: 0 });
  }
  await PeriodService.closePeriod(short.id, 2024, 8, actorOf(admin));
  await PeriodService.closePeriod(long.id, 2024, 8, actorOf(admin));

  const single = await renderPayslipsPdf([PayslipService.forMonth(short.id, 2024, 8)], { companyAddress: ['Musterstraße 1', '12345 Musterstadt'] });
  assert.equal(single.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pageCount(single), 1);

  const all = PayslipService.allForMonth(2024, 8).filter((p) => [short.id, long.id].includes(p.employee.id));
  const pdf = await renderPayslipsPdf(all);
  assert.equal(pageCount(pdf), 1 + 2, '62 Einträge brauchen zwei Seiten, der kurze Lohnzettel eine');
});

test('Lohnzettel-PDF: Zeichen ohne Darstellung in der Standardschrift werden ersetzt; Dateiname ohne Sonderzeichen', () => {
  assert.equal(toWinAnsi('Grüße – 5 € „ok“ 😀 ✓\nZeile'), 'Grüße – 5 € „ok“ ? ? Zeile');
  assert.equal(payslipFilename('2024-08-31', 'Jörg Groß-Öztürk'), 'Lohnzettel_2024-08_Jorg-Gross-Ozturk.pdf');
  assert.equal(payslipFilename('2024-08'), 'Lohnzettel_2024-08_alle.pdf');
});
