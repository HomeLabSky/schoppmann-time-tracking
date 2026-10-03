/**
 * Integrationstests der Zeiterfassung gegen eine temporäre SQLite-Datenbank.
 * Deckt die in Phase 1 behobenen Fehler ab (siehe BERICHT_MODERNISIERUNG.md, F1–F3 und
 * Monatsletzter) sowie die serverseitigen Fachregeln.
 */
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DB_STORAGE = path.join(os.tmpdir(), `schoppmann-unit-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = 'unit_test_jwt_secret_with_at_least_32_chars';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_with_at_least_32_chars';

const { initDatabase, sequelize, User, TimeEntry, MinijobSetting } = require('../models');
const TimeEntryService = require('../services/timeEntryService');
const { todayString } = require('../utils/clock');
const { addMonths } = require('../utils/billing');

let seq = 0;
const makeUser = (patch = {}) =>
  User.create({
    email: `unit${++seq}@schoppmann.de`,
    password: 'Abcdef12',
    name: 'Unit Test',
    stundenlohn: 10,
    ...patch
  });

/** Historischer Eintrag direkt über das Model (umgeht bewusst das Datumsfenster der Service-Regeln). */
const addEntry = (user, date, { start = '09:00', end = '17:00', breakMinutes = 0, rateCents = 1000 } = {}) =>
  TimeEntry.create({
    userId: user.id,
    date,
    startTime: `${start}:00`,
    endTime: `${end}:00`,
    breakMinutes,
    hourlyRateCents: rateCents
  });

const monthOf = (user, year, month) => TimeEntryService.getMonthlyTimeRecords(user.id, year, month);

test.before(async () => {
  await initDatabase();
  const admin = await makeUser({ role: 'admin' });
  await MinijobSetting.create({ monthlyLimit: 100, description: 'Limit 2024', validFrom: '2024-01-01', validUntil: '2024-12-31', createdBy: admin.id });
  await MinijobSetting.create({ monthlyLimit: 600, description: 'Limit ab 2025', validFrom: '2025-01-01', createdBy: admin.id });
});

test.after(async () => {
  await sequelize.close();
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

  await user.update({ stundenlohn: 20 });

  const reloaded = await TimeEntryService.getTimeEntry(created.id, user.id);
  assert.equal(reloaded.earnings, 80, 'Verdienst bleibt 80 €');
  assert.equal(reloaded.hourlyRate, 10);
});

test('F2: neuer Satz gilt nur für neue Einträge; Summe mischt beide Sätze korrekt', async () => {
  const user = await makeUser({ stundenlohn: 10 });
  await addEntry(user, '2024-06-03', { rateCents: 1000 }); // 8 h × 10 € = 80 €
  await user.update({ stundenlohn: 20 });
  await addEntry(user, '2024-06-04', { rateCents: 2000 }); // 8 h × 20 € = 160 €
  const month = await monthOf(user, 2024, 6);
  assert.equal(month.summary.totalEarnings, 240);
});

test('F2: ein Client kann den Stundensatz nicht selbst setzen (kein Mass-Assignment)', async () => {
  const user = await makeUser({ stundenlohn: 10 });
  const created = await TimeEntryService.createTimeEntry({
    userId: user.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0, hourlyRateCents: 99999
  });
  assert.equal(created.hourlyRate, 10);
});

// ---------- F3: Minijob-Grenze je Periode ----------

test('F3: für alte Monate gilt die damals gültige Grenze (2024: 100 €)', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03'); // 80 €
  const month = await monthOf(user, 2024, 6);
  assert.equal(month.summary.minijobLimit, 100);
  assert.equal(month.summary.exceedsLimit, false);
  assert.equal(month.summary.paidThisMonth, 80);

  const later = await monthOf(user, 2025, 6);
  assert.equal(later.summary.minijobLimit, 600);
});

test('F3: Übertrag nutzt je Periode die damalige Grenze', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03'); // 80 €
  await addEntry(user, '2024-06-04'); // 80 € → 160 € bei Grenze 100 € → 60 € Übertrag
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
  await addEntry(user, '2019-01-10', { start: '08:00', end: '18:00', rateCents: 90000 });
  await MinijobSetting.create({ monthlyLimit: 100, description: 'Limit 2019-2023', validFrom: '2019-01-01', validUntil: '2023-12-31', createdBy: user.id });
  // 2019-01 … 2024-05 = 65 Perioden à 100 € ausgezahlt → Rest 9000 − 6500 = 2500 €
  const june2024 = await monthOf(user, 2024, 6);
  assert.equal(june2024.summary.carryIn, 9000 - 65 * 100);
});

// ---------- Monatsende / Perioden ----------

test('Einträge am Monatsletzten werden erfasst (Regression: Zeitzonenfehler im Kalendermonat)', async () => {
  const user = await makeUser();
  for (const date of ['2024-06-01', '2024-06-30', '2024-02-29', '2024-07-31']) {
    await addEntry(user, date);
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
    await addEntry(user, date);
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

// Fachfehler: Code (z. B. PERIOD_CLOSED) und Meldung gemeinsam prüfbar
const reject = (promise, pattern) => assert.rejects(promise, (e) => pattern.test(`${e.code}: ${e.message}`));

test('Regeln: Zukunft, älter als ein Monat, > 12 h, < 15 min werden abgelehnt', async () => {
  const user = await makeUser();
  const base = { userId: user.id, startTime: '09:00', endTime: '17:00', breakMinutes: 0 };
  const today = todayString();

  await reject(TimeEntryService.createTimeEntry({ ...base, date: '2999-01-01' }), /Zukunft/);
  await reject(TimeEntryService.createTimeEntry({ ...base, date: addMonths(today, -2) }), /einen Monat/);
  await reject(TimeEntryService.createTimeEntry({ ...base, date: today, startTime: '06:00', endTime: '19:00' }), /12 Stunden/);
  await reject(TimeEntryService.createTimeEntry({ ...base, date: today, startTime: '09:00', endTime: '09:10' }), /15 Minuten/);
});

test('Regeln: doppelter Eintrag am selben Tag wird mit ENTRY_EXISTS abgelehnt', async () => {
  const user = await makeUser();
  const entry = { userId: user.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0 };
  await TimeEntryService.createTimeEntry(entry);
  await reject(TimeEntryService.createTimeEntry(entry), /ENTRY_EXISTS/);
});

test('Regeln: alte Einträge bleiben bearbeitbar (Datumsfenster gilt nur beim Anlegen)', async () => {
  const user = await makeUser();
  const old = await addEntry(user, '2024-06-03');
  const updated = await TimeEntryService.updateTimeEntry(old.id, { startTime: '08:00', endTime: '12:00', breakMinutes: 0 }, user.id);
  assert.equal(updated.workTime, '04:00');
  assert.equal(updated.hourlyRate, 10, 'eingefrorener Satz bleibt beim Bearbeiten erhalten');
});

test('Nutzer können fremde Einträge nicht bearbeiten oder löschen', async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const entry = await addEntry(owner, '2024-06-03');
  await reject(TimeEntryService.updateTimeEntry(entry.id, { startTime: '08:00', endTime: '12:00' }, other.id), /ENTRY_NOT_FOUND/);
  await reject(TimeEntryService.deleteTimeEntry(entry.id, other.id), /ENTRY_NOT_FOUND/);
});
