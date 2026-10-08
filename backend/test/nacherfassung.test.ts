/**
 * Nacherfassung: Der Admin gibt einem Mitarbeiter frei, Zeiten weiter als einen Monat zurück zu erfassen (z. B. Übernahme
 * aus Excel). Nacherfasste Einträge landen in ihrem eigenen Monat; ist er abgeschlossen, als Nachtrag nur im direkt
 * folgenden Monat.
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { closeDb, initDatabase } from '../src/db';
import type { User } from '../src/db/schema';
import { AuditService } from '../src/services/auditService';
import { PeriodService } from '../src/services/periodService';
import { TimeEntryService } from '../src/services/timeEntryService';
import { UserService } from '../src/services/userService';
import * as billing from '../src/utils/billing';
import { todayString } from '../src/utils/clock';
import { actorOf, addEntry, addLimit, makeUser as createUser, reject } from './helpers';

const makeUser = (patch: Partial<User> = {}) => createUser({ name: 'Nacherfassung Test', stundenlohn: 10, ...patch }, 'nacherfassung');
const today = todayString();
const monthOf = (date: string): [number, number] => [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
// Erster Tag des Monats vor drei Monaten: sicher außerhalb des normalen Fensters
const threeMonthsAgo = `${billing.addMonths(today, -3).slice(0, 7)}-01`;
const entry = (userId: number, date: string, startTime = '09:00', endTime = '11:00') =>
  ({ userId, date, startTime, endTime, breakMinutes: 0 });

let admin: User;

test.before(async () => {
  await initDatabase();
  admin = await makeUser({ role: 'admin' });
  addLimit(admin.id, 1000, '2020-01-01', null, 'Grenze 1000 €');
});

test.after(() => {
  closeDb();
});

test('Regel: ohne Freigabe höchstens einen Monat zurück, mit Freigabe bis zum freigegebenen Tag', () => {
  const rule = (date: string, backdateFrom?: string | null) =>
    billing.validateEntryRules({ date, startTime: '09:00', endTime: '10:00', breakMinutes: 0 }, { today: '2026-10-08', checkDateWindow: true, backdateFrom });
  assert.match(rule('2026-08-01').join(), /einen Monat/);
  assert.deepEqual(rule('2026-01-02', '2026-01-01'), []);
  assert.match(rule('2025-12-31', '2026-01-01').join(), /nicht vor dem 01\.01\.2026/);
  assert.match(rule('2026-08-01', '2026-09-20').join(), /einen Monat/, 'Freigabe innerhalb des Fensters ändert nichts');
});

test('Nacherfassung: erst nach Freigabe möglich, Eintrag landet im eigenen Monat', async () => {
  const user = await makeUser();
  await reject(TimeEntryService.createTimeEntry(entry(user.id, threeMonthsAgo), actorOf(user)), /VALIDATION_ERROR.*einen Monat/);

  const updated = await UserService.adminUpdateUserSettings(user.id, { nacherfassungAb: threeMonthsAgo }, actorOf(admin));
  assert.equal(updated.nacherfassungAb, threeMonthsAgo);

  const created = await TimeEntryService.createTimeEntry(entry(user.id, threeMonthsAgo), actorOf(user));
  assert.equal(created.billingDate, null, 'kein Nachtrag');
  const [year, month] = monthOf(threeMonthsAgo);
  const sheet = await TimeEntryService.getMonthlyTimeRecords(user.id, year, month);
  assert.deepEqual(sheet.records.map((r) => r.id), [created.id]);

  // Vor dem freigegebenen Tag weiterhin gesperrt
  await reject(TimeEntryService.createTimeEntry(entry(user.id, billing.addDays(threeMonthsAgo, -1)), actorOf(user)), /VALIDATION_ERROR.*Nacherfassung/);

  // Freigabe aufheben → wieder nur einen Monat
  const cleared = await UserService.adminUpdateUserSettings(user.id, { nacherfassungAb: '' }, actorOf(admin));
  assert.equal(cleared.nacherfassungAb, null);
  await reject(TimeEntryService.createTimeEntry(entry(user.id, billing.addDays(threeMonthsAgo, 1)), actorOf(user)), /einen Monat/);

  const [log] = (await AuditService.list({ userId: user.id, action: 'user.settings_update' })).entries;
  assert.equal((log?.before as { nacherfassungAb?: string })?.nacherfassungAb, threeMonthsAgo, 'Freigabe steht im Protokoll');
});

test('Nacherfassung: Tag im abgeschlossenen Monat wird Nachtrag im direkt folgenden Monat', async () => {
  const user = await makeUser({ nacherfassungAb: threeMonthsAgo });
  addEntry(user, threeMonthsAgo);
  const [year, month] = monthOf(threeMonthsAgo);
  await PeriodService.closePeriod(user.id, year, month, actorOf(admin)); // wie damals: Monat schon abgerechnet

  const lateDay = billing.addDays(billing.addMonths(threeMonthsAgo, 1), -3); // gegen Ende des abgeschlossenen Monats
  const late = await TimeEntryService.createTimeEntry(entry(user.id, lateDay), actorOf(user));
  const nextStart = billing.addMonths(threeMonthsAgo, 1);
  assert.equal(late.billingDate, nextStart, 'abgerechnet im Folgemonat');
  const [ny, nm] = monthOf(nextStart);
  assert.deepEqual((await TimeEntryService.getMonthlyTimeRecords(user.id, ny, nm)).records.map((r) => r.id), [late.id]);
});

test('Nacherfassung: ist auch der Folgemonat abgeschlossen, wird abgelehnt statt weiter verschoben', async () => {
  const user = await makeUser({ nacherfassungAb: threeMonthsAgo });
  const nextStart = billing.addMonths(threeMonthsAgo, 1);
  addEntry(user, threeMonthsAgo);
  addEntry(user, nextStart);
  for (const date of [threeMonthsAgo, nextStart]) {
    const [y, m] = monthOf(date);
    await PeriodService.closePeriod(user.id, y, m, actorOf(admin));
  }

  await reject(
    TimeEntryService.createTimeEntry(entry(user.id, billing.addDays(threeMonthsAgo, 1)), actorOf(user)),
    /PERIOD_CLOSED.*ebenfalls abgeschlossen/
  );
});

test('Nacherfassung: Monate werden danach der Reihe nach normal abgeschlossen', async () => {
  const user = await makeUser({ nacherfassungAb: threeMonthsAgo });
  const late = billing.addMonths(threeMonthsAgo, 1);
  await TimeEntryService.createTimeEntry(entry(user.id, threeMonthsAgo), actorOf(user));
  await TimeEntryService.createTimeEntry(entry(user.id, late), actorOf(user));

  const [y2, m2] = monthOf(late);
  await reject(PeriodService.closePeriod(user.id, y2, m2, actorOf(admin)), /PERIOD_PREVIOUS_OPEN/);
  const [y1, m1] = monthOf(threeMonthsAgo);
  const first = await PeriodService.closePeriod(user.id, y1, m1, actorOf(admin));
  assert.equal(first.earningsCents, 2000);
  const second = await PeriodService.closePeriod(user.id, y2, m2, actorOf(admin));
  assert.equal(second.entryCount, 1);
});
