/**
 * Integrationstests der Zeiterfassung gegen eine temporäre SQLite-Datenbank.
 * Deckt die in Phase 1 behobenen Fehler ab (siehe BERICHT_MODERNISIERUNG.md, F1–F3 und
 * Monatsletzter) sowie die serverseitigen Fachregeln.
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { closeDb, initDatabase } from '../src/db';
import { db } from '../src/db/client';
import { timeEntries, users, type User } from '../src/db/schema';
import { TimeEntryService } from '../src/services/timeEntryService';
import { addDays, addMonths } from '../src/utils/billing';
import { todayString } from '../src/utils/clock';
import { addEntry, addLimit, makeUser as createUser, reject } from './helpers';

const makeUser = (patch: Partial<User> = {}) => createUser({ name: 'Unit Test', stundenlohn: 10, ...patch }, 'unit');
const setRate = (user: User, stundenlohn: number) => db().update(users).set({ stundenlohn }).where(eq(users.id, user.id)).run();

const monthOf = (user: User, year: number, month: number) => TimeEntryService.getMonthlyTimeRecords(user.id, year, month);

test.before(async () => {
  await initDatabase();
  const admin = await makeUser({ role: 'admin' });
  addLimit(admin.id, 100, '2024-01-01', '2024-12-31', 'Limit 2024');
  addLimit(admin.id, 600, '2025-01-01', null, 'Limit ab 2025');
});

test.after(() => {
  closeDb();
});

// ---------- F1: Pause ----------

test('F1: Pause 0 bleibt beim Anlegen und Bearbeiten 0 (Arbeitszeit 8:00)', async () => {
  const user = await makeUser();
  const created = await TimeEntryService.createTimeEntry({
    userId: user.id, date: todayString(), startTime: '09:00', endTime: '17:00', breakMinutes: 0
  });
  assert.equal(created.breakMinutes, 0);
  assert.equal(created.workTime, '08:00');

  const updated = await TimeEntryService.updateTimeEntry(created.id, { startTime: '09:00', endTime: '17:00', breakMinutes: 0 }, user.id);
  assert.equal(updated.breakMinutes, 0);
  assert.equal(updated.workTime, '08:00');
});

test('F1: ohne Pausenangabe gilt der Standard von 30 Minuten', async () => {
  const user = await makeUser();
  const created = await TimeEntryService.createTimeEntry({
    userId: user.id, date: todayString(), startTime: '09:00', endTime: '17:00'
  });
  assert.equal(created.breakMinutes, 30);
  assert.equal(created.workTime, '07:30');
});

// ---------- F2: Stundensatz eingefroren ----------

test('F2: Lohnänderung wirkt nicht rückwirkend auf bestehende Einträge', async () => {
  const user = await makeUser({ stundenlohn: 10 });
  const created = await TimeEntryService.createTimeEntry({
    userId: user.id, date: todayString(), startTime: '09:00', endTime: '17:00', breakMinutes: 0
  });
  assert.equal(created.earnings, 80);
  assert.equal(created.hourlyRate, 10);

  setRate(user, 20);

  const reloaded = await TimeEntryService.getTimeEntry(created.id, user.id);
  assert.equal(reloaded.earnings, 80, 'Verdienst bleibt 80 €');
  assert.equal(reloaded.hourlyRate, 10);
});

test('F2: neuer Satz gilt nur für neue Einträge; Summe mischt beide Sätze korrekt', async () => {
  const user = await makeUser({ stundenlohn: 10 });
  addEntry(user, '2024-06-03', { rateCents: 1000 }); // 8 h × 10 € = 80 €
  setRate(user, 20);
  addEntry(user, '2024-06-04', { rateCents: 2000 }); // 8 h × 20 € = 160 €
  const month = await monthOf(user, 2024, 6);
  assert.equal(month.summary.totalEarnings, 240);
});

test('F2: ein Client kann den Stundensatz nicht selbst setzen (kein Mass-Assignment)', async () => {
  const user = await makeUser({ stundenlohn: 10 });
  // Fremdes Feld wie aus einem manipulierten Request-Body
  const tampered = { userId: user.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0, hourlyRateCents: 99999 };
  const created = await TimeEntryService.createTimeEntry(tampered);
  assert.equal(created.hourlyRate, 10);
});

// ---------- F3: Minijob-Grenze je Periode ----------

test('F3: für alte Monate gilt die damals gültige Grenze (2024: 100 €)', async () => {
  const user = await makeUser();
  addEntry(user, '2024-06-03'); // 80 €
  const month = await monthOf(user, 2024, 6);
  assert.equal(month.summary.minijobLimit, 100);
  assert.equal(month.summary.exceedsLimit, false);
  assert.equal(month.summary.paidThisMonth, 80);

  const later = await monthOf(user, 2025, 6);
  assert.equal(later.summary.minijobLimit, 600);
});

test('F3: Übertrag nutzt je Periode die damalige Grenze', async () => {
  const user = await makeUser();
  addEntry(user, '2024-06-03'); // 80 €
  addEntry(user, '2024-06-04'); // 80 € → 160 € bei Grenze 100 € → 60 € Übertrag
  const june = await monthOf(user, 2024, 6);
  assert.equal(june.summary.totalEarnings, 160);
  assert.equal(june.summary.paidThisMonth, 100);
  assert.equal(june.summary.carryOut, 60);
  assert.equal(june.summary.exceedsLimit, true);

  const july = await monthOf(user, 2024, 7);
  assert.equal(july.summary.carryIn, 60);
  assert.equal(july.summary.paidThisMonth, 60);
  assert.equal(july.summary.carryOut, 0);
});

test('Übertrag bleibt über mehr als 50 Monate korrekt (früher Abbruch nach 50 Iterationen)', async () => {
  const user = await makeUser();
  // Januar 2019: 10 h × 900 €/h = 9.000 €; in allen Monaten bis Mai 2024 gilt eine Grenze von 100 €
  addEntry(user, '2019-01-10', { start: '08:00', end: '18:00', rateCents: 90000 });
  addLimit(user.id, 100, '2019-01-01', '2023-12-31', 'Limit 2019-2023');
  // 2019-01 … 2024-05 = 65 Perioden à 100 € ausgezahlt → Rest 9000 − 6500 = 2500 €
  const june2024 = await monthOf(user, 2024, 6);
  assert.equal(june2024.summary.carryIn, 9000 - 65 * 100);
});

// ---------- Monatsende / Perioden ----------

test('Einträge am Monatsletzten werden erfasst (Regression: Zeitzonenfehler im Kalendermonat)', async () => {
  const user = await makeUser();
  for (const date of ['2024-06-01', '2024-06-30', '2024-02-29', '2024-07-31']) {
    addEntry(user, date);
  }
  const june = await monthOf(user, 2024, 6);
  assert.deepEqual(june.records.map((r) => r.date), ['2024-06-01', '2024-06-30']);
  assert.equal(june.period.endDate, '2024-06-30');

  const feb = await monthOf(user, 2024, 2);
  assert.deepEqual(feb.records.map((r) => r.date), ['2024-02-29']);
  assert.equal(feb.period.endDate, '2024-02-29');

  const july = await monthOf(user, 2024, 7);
  assert.deepEqual(july.records.map((r) => r.date), ['2024-07-31']);
});

test('periodenübergreifende Abrechnung 22.–21.: Zuordnung zum richtigen Referenzmonat', async () => {
  const user = await makeUser({ abrechnungStart: 22, abrechnungEnde: 21 });
  for (const date of ['2024-06-21', '2024-06-22', '2024-07-21', '2024-07-22']) {
    addEntry(user, date);
  }
  const june = await monthOf(user, 2024, 6); // 22.06.–21.07.
  assert.equal(june.period.startDate, '2024-06-22');
  assert.equal(june.period.endDate, '2024-07-21');
  assert.deepEqual(june.records.map((r) => r.date), ['2024-06-22', '2024-07-21']);

  const july = await monthOf(user, 2024, 7); // 22.07.–21.08.
  assert.deepEqual(july.records.map((r) => r.date), ['2024-07-22']);

  const may = await monthOf(user, 2024, 5); // 22.05.–21.06.
  assert.deepEqual(may.records.map((r) => r.date), ['2024-06-21']);
});

test('Perioden-Dropdown: aktuelle Periode ist markiert und endet am echten Monatsletzten', async () => {
  const user = await makeUser();
  const periods = await TimeEntryService.generateBillingPeriods(user.id, 12, 3);
  const current = periods.filter((p) => p.isCurrent);
  assert.equal(current.length, 1);
  const [y, m] = todayString().split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  assert.equal(current[0].endDate, `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
});

// ---------- Serverseitige Fachregeln ----------


test('Regeln: Zukunft, älter als ein Monat, > 12 h, < 15 min werden abgelehnt', async () => {
  const user = await makeUser();
  const base = { userId: user.id, startTime: '09:00', endTime: '17:00', breakMinutes: 0 };
  const today = todayString();

  await reject(TimeEntryService.createTimeEntry({ ...base, date: '2999-01-01' }), /Zukunft/);
  await reject(TimeEntryService.createTimeEntry({ ...base, date: addMonths(today, -2) }), /einen Monat/);
  await reject(TimeEntryService.createTimeEntry({ ...base, date: today, startTime: '06:00', endTime: '19:00' }), /12 Stunden/);
  await reject(TimeEntryService.createTimeEntry({ ...base, date: today, startTime: '09:00', endTime: '09:10' }), /15 Minuten/);
});

// ---------- Mehrere Einträge pro Tag ----------

test('Mehrere Einträge pro Tag: nicht überschneidend erlaubt, direkt anschließend erlaubt, Überschneidung abgelehnt', async () => {
  const user = await makeUser();
  const today = todayString();
  const add = (startTime: string, endTime: string) =>
    TimeEntryService.createTimeEntry({ userId: user.id, date: today, startTime, endTime, breakMinutes: 0 });

  await add('08:00', '12:00');
  await add('12:00', '13:00'); // beginnt genau, wo der erste endet
  await add('17:00', '19:30');
  await reject(add('08:00', '12:00'), /ENTRY_OVERLAP/); // identisch
  await reject(add('11:59', '12:30'), /ENTRY_OVERLAP.*08:00–12:00/);
  await reject(add('16:00', '20:00'), /ENTRY_OVERLAP/); // umschließt
  await reject(add('18:00', '18:30'), /ENTRY_OVERLAP/); // liegt innerhalb

  const [y, m] = today.split('-').map(Number);
  const month = await monthOf(user, y, m);
  assert.deepEqual(month.records.map((r) => r.startTime), ['08:00', '12:00', '17:00'], 'sortiert nach Datum und Beginn');
  assert.equal(month.summary.entryCount, 3);
  assert.equal(month.summary.workDays, 1);
  assert.equal(month.summary.totalHours, 7.5);
  assert.equal(month.summary.totalEarnings, 75);
});

test('Mehrere Einträge pro Tag: Nachtschicht vom Vortag zählt bei der Überschneidung mit', async () => {
  const user = await makeUser();
  const today = todayString();
  const yesterday = addDays(today, -1);
  await TimeEntryService.createTimeEntry({ userId: user.id, date: yesterday, startTime: '22:00', endTime: '02:00', breakMinutes: 0 });

  await reject(TimeEntryService.createTimeEntry({ userId: user.id, date: today, startTime: '01:00', endTime: '03:00', breakMinutes: 0 }), /ENTRY_OVERLAP/);
  await TimeEntryService.createTimeEntry({ userId: user.id, date: today, startTime: '02:00', endTime: '04:00', breakMinutes: 0 });
  // umgekehrt: späte Nachtschicht darf nicht in einen Eintrag des Folgetags reichen
  await reject(TimeEntryService.createTimeEntry({ userId: user.id, date: yesterday, startTime: '23:30', endTime: '02:30', breakMinutes: 0 }), /ENTRY_OVERLAP/);
});

test('Mehrere Einträge pro Tag: höchstens 12 Stunden Arbeitszeit je Tag', async () => {
  const user = await makeUser();
  const date = todayString();
  await TimeEntryService.createTimeEntry({ userId: user.id, date, startTime: '06:00', endTime: '14:00', breakMinutes: 0 });
  await reject(
    TimeEntryService.createTimeEntry({ userId: user.id, date, startTime: '15:00', endTime: '19:30', breakMinutes: 0 }),
    /12 Stunden.*8:00 Std/
  );
  await TimeEntryService.createTimeEntry({ userId: user.id, date, startTime: '15:00', endTime: '19:30', breakMinutes: 30 }); // genau 12 h
});

test('Mehrere Einträge pro Tag: Standardpause nur für den ersten Eintrag des Tages', async () => {
  const user = await makeUser();
  const date = todayString();
  const first = await TimeEntryService.createTimeEntry({ userId: user.id, date, startTime: '08:00', endTime: '12:00' });
  const second = await TimeEntryService.createTimeEntry({ userId: user.id, date, startTime: '14:00', endTime: '16:00' });
  const third = await TimeEntryService.createTimeEntry({ userId: user.id, date, startTime: '17:00', endTime: '18:00', breakMinutes: 15 });
  assert.equal(first.breakMinutes, 30);
  assert.equal(second.breakMinutes, 0, 'Pause liegt zwischen den Einträgen');
  assert.equal(third.breakMinutes, 15, 'ausdrückliche Angabe gilt immer');
});

test('Mehrere Einträge pro Tag: Bearbeiten prüft Überschneidung und Tagesgrenze, der Eintrag selbst zählt nicht', async () => {
  const user = await makeUser();
  const morning = addEntry(user, '2024-06-03', { start: '08:00', end: '12:00' });
  addEntry(user, '2024-06-03', { start: '13:00', end: '17:00' });

  const moved = await TimeEntryService.updateTimeEntry(morning.id, { startTime: '07:00', endTime: '13:00', breakMinutes: 0 }, user.id);
  assert.equal(moved.endTime, '13:00', 'eigene alte Zeiten blockieren nicht');
  await reject(TimeEntryService.updateTimeEntry(morning.id, { endTime: '13:30' }, user.id), /ENTRY_OVERLAP.*13:00–17:00/);
  await reject(TimeEntryService.updateTimeEntry(morning.id, { startTime: '09:00', endTime: '14:00', breakMinutes: 0 }, user.id), /ENTRY_OVERLAP/);
  await reject(TimeEntryService.updateTimeEntry(morning.id, { startTime: '00:00', endTime: '09:00', breakMinutes: 0 }, user.id), /12 Stunden/);
});

test('Mehrere Einträge pro Tag: Wiederholung mit clientId legt nichts doppelt an', async () => {
  const user = await makeUser();
  const entry = { userId: user.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0, clientId: 'unit-replay-0001' };
  const first = await TimeEntryService.createTimeEntryIdempotent(entry);
  const again = await TimeEntryService.createTimeEntryIdempotent(entry);
  assert.equal(again.replayed, true);
  assert.equal(again.entry.id, first.entry.id);
  await TimeEntryService.createTimeEntryIdempotent({ ...entry, startTime: '10:00', endTime: '11:00', clientId: 'unit-replay-0002' });
});

test('Mehrere Einträge pro Tag: die Datenbank weist Überschneidungen auch bei direktem SQL ab (Trigger)', async () => {
  const user = await makeUser();
  const entry = addEntry(user, '2024-06-03', { start: '22:00', end: '02:00' });
  assert.throws(() => addEntry(user, '2024-06-04', { start: '01:00', end: '03:00' }), /time_entries_overlap/);
  assert.throws(() => addEntry(user, '2024-06-03', { start: '23:00', end: '23:30' }), /time_entries_overlap/);
  addEntry(user, '2024-06-04', { start: '02:00', end: '03:00' }); // direkt anschließend
  addEntry(user, '2024-06-03', { start: '20:00', end: '22:00' });
  assert.throws(
    () => db().update(timeEntries).set({ startTime: '21:00:00' }).where(eq(timeEntries.id, entry.id)).run(),
    /time_entries_overlap/
  );
  db().update(timeEntries).set({ breakMinutes: 15 }).where(eq(timeEntries.id, entry.id)).run(); // andere Spalten frei
});

test('Regeln: alte Einträge bleiben bearbeitbar (Datumsfenster gilt nur beim Anlegen)', async () => {
  const user = await makeUser();
  const old = addEntry(user, '2024-06-03');
  const updated = await TimeEntryService.updateTimeEntry(old.id, { startTime: '08:00', endTime: '12:00', breakMinutes: 0 }, user.id);
  assert.equal(updated.workTime, '04:00');
  assert.equal(updated.hourlyRate, 10, 'eingefrorener Satz bleibt beim Bearbeiten erhalten');
});

test('Nutzer können fremde Einträge nicht bearbeiten oder löschen', async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const entry = addEntry(owner, '2024-06-03');
  await reject(TimeEntryService.updateTimeEntry(entry.id, { startTime: '08:00', endTime: '12:00' }, other.id), /ENTRY_NOT_FOUND/);
  await reject(TimeEntryService.deleteTimeEntry(entry.id, other.id), /ENTRY_NOT_FOUND/);
});
