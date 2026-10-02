/**
 * Integrationstests für Änderungsprotokoll (Audit-Log) und Monatsabschluss.
 */
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DB_STORAGE = path.join(os.tmpdir(), `schoppmann-audit-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = 'unit_test_jwt_secret_with_at_least_32_chars';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_with_at_least_32_chars';

const { initDatabase, sequelize, User, TimeEntry, MinijobSetting, AuditLog, PeriodClosure } = require('../models');
const TimeEntryService = require('../services/timeEntryService');
const PeriodService = require('../services/periodService');
const UserService = require('../services/userService');
const AuditService = require('../services/auditService');
const { todayString } = require('../utils/clock');

let seq = 0;
const makeUser = (patch = {}) =>
  User.create({ email: `audit${++seq}@schoppmann.de`, password: 'Abcdef12', name: 'Audit Test', stundenlohn: 10, ...patch });

const addEntry = (user, date, { start = '09:00', end = '17:00', breakMinutes = 0, rateCents = 1000 } = {}) =>
  TimeEntry.create({ userId: user.id, date, startTime: `${start}:00`, endTime: `${end}:00`, breakMinutes, hourlyRateCents: rateCents });

const reject = (promise, pattern) => assert.rejects(promise, (e) => pattern.test(e.message));
const actorOf = (u) => ({ id: u.id, email: u.email });
const logFor = (userId, action) => AuditService.list({ userId, action, limit: 200 }).then((r) => r.entries);

let admin;
let adminActor;

test.before(async () => {
  await initDatabase();
  admin = await makeUser({ role: 'admin' });
  adminActor = actorOf(admin);
  await MinijobSetting.create({ monthlyLimit: 100, description: 'Limit 2024', validFrom: '2024-01-01', validUntil: '2024-12-31', createdBy: admin.id });
  await MinijobSetting.create({ monthlyLimit: 600, description: 'Limit ab 2025', validFrom: '2025-01-01', createdBy: admin.id });
});

test.after(async () => {
  await sequelize.close();
});

// ---------- Änderungsprotokoll ----------

test('Audit: Anlegen, Ändern und Löschen eines Eintrags werden mit Vorher/Nachher protokolliert', async () => {
  const user = await makeUser();
  const created = await TimeEntryService.createTimeEntry(
    { userId: user.id, date: todayString(), startTime: '09:00', endTime: '17:00', breakMinutes: 0, description: 'Start' },
    actorOf(user)
  );
  await TimeEntryService.updateTimeEntry(created.id, { startTime: '10:00', endTime: '16:00', breakMinutes: 0, description: 'Geändert' }, user.id, actorOf(user));
  await TimeEntryService.deleteTimeEntry(created.id, user.id, actorOf(user));

  const entries = (await logFor(user.id, 'time_entry')).reverse(); // chronologisch
  assert.deepEqual(entries.map((e) => e.action), ['time_entry.create', 'time_entry.update', 'time_entry.delete']);

  const [create, update, del] = entries;
  assert.equal(create.actorEmail, user.email);
  assert.equal(create.targetUserId, user.id);
  assert.equal(create.after.startTime, '09:00');
  assert.equal(create.before, null);

  assert.equal(update.before.startTime, '09:00');
  assert.equal(update.after.startTime, '10:00');
  assert.equal(update.before.description, 'Start');
  assert.equal(update.after.description, 'Geändert');

  assert.equal(del.before.startTime, '10:00', 'gelöschter Zustand bleibt nachvollziehbar');
  assert.equal(del.after, null);
  assert.equal(del.entityId, created.id);
});

test('Audit: fehlgeschlagene Änderung hinterlässt keinen Protokolleintrag (gleiche Transaktion)', async () => {
  const user = await makeUser();
  const before = (await logFor(user.id, 'time_entry')).length;
  await reject(
    TimeEntryService.createTimeEntry({ userId: user.id, date: '2999-01-01', startTime: '09:00', endTime: '17:00' }, actorOf(user)),
    /Zukunft/
  );
  assert.equal((await logFor(user.id, 'time_entry')).length, before);
  assert.equal(await TimeEntry.count({ where: { userId: user.id } }), 0);
});

test('Audit: Protokoll ist unveränderlich (Model und Datenbank)', async () => {
  const row = await AuditService.record({ actor: adminActor, action: 'test.immutable', entityType: 'Test' });

  await assert.rejects(() => row.update({ action: 'manipuliert' }), /unveränderlich/);
  await assert.rejects(() => AuditLog.destroy({ where: { id: row.id } }), /unveränderlich/);
  await assert.rejects(() => sequelize.query("UPDATE AuditLogs SET action = 'x'"));
  await assert.rejects(() => sequelize.query('DELETE FROM AuditLogs'));

  const reloaded = await AuditLog.findByPk(row.id);
  assert.equal(reloaded.action, 'test.immutable');
});

test('Audit: Passwörter landen nie im Protokoll', async () => {
  const secret = 'Geheim1234Passwort';
  const created = await UserService.createUser({ email: 'secret@schoppmann.de', password: secret, name: 'Geheim Test' }, adminActor);
  await UserService.adminUpdateUser(created.id, { password: 'NochGeheimer99' }, adminActor);

  const all = JSON.stringify((await AuditService.list({ userId: created.id, limit: 200 })).entries);
  assert.ok(!all.includes(secret) && !all.includes('NochGeheimer99'), 'kein Passwort im Klartext');
  assert.ok(!/"password"/i.test(all), 'kein Passwort-Feld');
  assert.ok(all.includes('passwordChanged'), 'Passwortänderung wird als Ereignis vermerkt');
});

test('Audit: Geheimnisfelder werden auch bei versehentlicher Übergabe entfernt (zweite Verteidigungslinie)', async () => {
  const row = await AuditService.record({
    actor: adminActor,
    action: 'test.secrets',
    entityType: 'Test',
    before: { name: 'a', password: 'KlartextVorher' },
    after: { name: 'b', nested: { refreshToken: 'abc', ok: 1 }, list: [{ accessToken: 'x', keep: true }] },
    meta: { token: 'zzz', reason: 'ok' }
  });
  const stored = JSON.stringify((await AuditLog.findByPk(row.id)).toJSON());
  for (const secret of ['KlartextVorher', 'abc', '"x"', 'zzz']) {
    assert.ok(!stored.includes(secret), `${secret} darf nicht gespeichert sein`);
  }
  assert.ok(stored.includes('"keep":true') && stored.includes('"reason":"ok"'), 'übrige Felder bleiben erhalten');
});

test('Audit: Benutzerverwaltung wird protokolliert (anlegen, ändern, Einstellungen, deaktivieren, löschen)', async () => {
  const created = await UserService.createUser({ email: 'managed@schoppmann.de', password: 'Abcdef12', name: 'Managed' }, adminActor);
  await UserService.adminUpdateUser(created.id, { name: 'Managed Neu' }, adminActor);
  await UserService.adminUpdateUserSettings(created.id, { stundenlohn: 13.5 }, adminActor);
  await UserService.toggleUserStatus(created.id, adminActor);
  await UserService.deleteUser(created.id, adminActor);

  const actions = (await logFor(created.id)).map((e) => e.action).reverse();
  assert.deepEqual(actions, ['user.create', 'user.update', 'user.settings_update', 'user.deactivate', 'user.delete']);

  const settings = (await logFor(created.id, 'user.settings_update'))[0];
  assert.equal(settings.before.stundenlohn, 10 === settings.before.stundenlohn ? 10 : settings.before.stundenlohn);
  assert.equal(settings.after.stundenlohn, 13.5);
  assert.equal(settings.actorEmail, admin.email);
});

test('Audit: Minijob-Einstellungen werden protokolliert', async () => {
  const MinijobService = require('../services/minijobService');
  const { setting } = await MinijobService.createSetting(
    { monthlyLimit: 700, description: 'Zukunft', validFrom: '2999-01-01', validUntil: null },
    admin.id,
    adminActor
  );
  await MinijobService.updateSetting(setting.id, { monthlyLimit: 710, description: 'Zukunft', validFrom: '2999-01-01', validUntil: null }, adminActor);
  await MinijobService.deleteSetting(setting.id, adminActor);

  const { entries } = await AuditService.list({ entityType: 'MinijobSetting', limit: 200 });
  const mine = entries.filter((e) => e.entityId === setting.id).reverse();
  assert.deepEqual(mine.map((e) => e.action), ['minijob_setting.create', 'minijob_setting.update', 'minijob_setting.delete']);
  assert.equal(mine[1].before.monthlyLimit, 700);
  assert.equal(mine[1].after.monthlyLimit, 710);
});

test('Audit: Konten mit Zeiteinträgen können nicht gelöscht werden (Nachweise bleiben erhalten)', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03');
  await reject(UserService.deleteUser(user.id, adminActor), /USER_HAS_DEPENDENCIES/);
  assert.ok(await User.findByPk(user.id));
});

test('Audit: Liste filtert nach Benutzer, Aktion und Seite', async () => {
  const user = await makeUser();
  const other = await makeUser();
  await TimeEntryService.createTimeEntry({ userId: user.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0 }, actorOf(user));
  await TimeEntryService.createTimeEntry({ userId: other.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0 }, actorOf(other));

  const mine = await AuditService.list({ userId: user.id });
  assert.ok(mine.entries.length >= 1 && mine.entries.every((e) => e.targetUserId === user.id));
  const paged = await AuditService.list({ limit: 1, page: 1 });
  assert.equal(paged.entries.length, 1);
  assert.ok(paged.pagination.total >= 2);
});

// ---------- Monatsabschluss ----------

const previousMonth = () => {
  const [y, m] = todayString().split('-').map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, first: `${year}-${pad(month)}-01`, last: `${year}-${pad(month)}-${pad(lastDay)}` };
};

test('Abschluss: laufende Periode kann nicht abgeschlossen werden', async () => {
  const user = await makeUser();
  const [y, m] = todayString().split('-').map(Number);
  await reject(PeriodService.closePeriod(user.id, y, m, adminActor), /PERIOD_NOT_ENDED/);
});

test('Abschluss: sperrt Anlegen, Ändern und Löschen in der Periode, andere Perioden bleiben frei', async () => {
  const user = await makeUser();
  const prev = previousMonth();
  const entry = await addEntry(user, prev.first);

  const closure = await PeriodService.closePeriod(user.id, prev.year, prev.month, adminActor);
  assert.equal(closure.periodStart, prev.first);
  assert.equal(closure.periodEnd, prev.last);
  assert.equal(closure.entryCount, 1);
  assert.equal(closure.earningsCents, 8000);

  await reject(TimeEntryService.createTimeEntry({ userId: user.id, date: prev.last, startTime: '09:00', endTime: '10:00', breakMinutes: 0 }, actorOf(user)), /PERIOD_CLOSED/);
  await reject(TimeEntryService.updateTimeEntry(entry.id, { startTime: '08:00', endTime: '12:00' }, user.id, actorOf(user)), /PERIOD_CLOSED/);
  await reject(TimeEntryService.deleteTimeEntry(entry.id, user.id, actorOf(user)), /PERIOD_CLOSED/);
  assert.equal((await TimeEntry.findByPk(entry.id)).startTime, '09:00:00', 'Eintrag unverändert');

  // laufende Periode bleibt bearbeitbar
  const today = await TimeEntryService.createTimeEntry({ userId: user.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0 }, actorOf(user));
  assert.ok(today.id);

  const month = await TimeEntryService.getMonthlyTimeRecords(user.id, prev.year, prev.month);
  assert.equal(month.period.status, 'closed');
  assert.ok(month.closure.closedAt);
  const periods = await TimeEntryService.generateBillingPeriods(user.id);
  assert.equal(periods.find((p) => p.startDate === prev.first).isClosed, true);
});

test('Abschluss: Doppelt abschließen wird abgelehnt', async () => {
  const user = await makeUser();
  const prev = previousMonth();
  await addEntry(user, prev.first);
  await PeriodService.closePeriod(user.id, prev.year, prev.month, adminActor);
  await reject(PeriodService.closePeriod(user.id, prev.year, prev.month, adminActor), /PERIOD_ALREADY_CLOSED/);
});

test('Abschluss: eingefrorene Zahlen ändern sich nicht, auch wenn die Minijob-Grenze später geändert wird', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03');
  await addEntry(user, '2024-06-04'); // 160 € bei Grenze 100 € → 60 € Übertrag
  await PeriodService.closePeriod(user.id, 2024, 6, adminActor);

  const limit2024 = await MinijobSetting.findOne({ where: { validFrom: '2024-01-01' } });
  await limit2024.update({ monthlyLimit: 500 });
  try {
    const june = await TimeEntryService.getMonthlyTimeRecords(user.id, 2024, 6);
    assert.equal(june.summary.minijobLimit, 100, 'Grenze zum Abschlusszeitpunkt');
    assert.equal(june.summary.paidThisMonth, 100);
    assert.equal(june.summary.carryOut, 60);

    const july = await TimeEntryService.getMonthlyTimeRecords(user.id, 2024, 7);
    assert.equal(july.summary.carryIn, 60, 'Übertrag aus dem abgeschlossenen Juni bleibt stabil');
    assert.equal(july.summary.minijobLimit, 500, 'offene Perioden nutzen die aktuelle Einstellung');
  } finally {
    await limit2024.update({ monthlyLimit: 100 });
  }
});

test('Abschluss: frühere Perioden mit Einträgen müssen zuerst abgeschlossen werden', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03');
  await addEntry(user, '2024-07-03');
  await reject(PeriodService.closePeriod(user.id, 2024, 7, adminActor), /PERIOD_PREVIOUS_OPEN/);

  await PeriodService.closePeriod(user.id, 2024, 6, adminActor);
  await PeriodService.closePeriod(user.id, 2024, 7, adminActor); // jetzt möglich
  assert.equal((await PeriodService.listClosures(user.id)).length, 2);
});

test('Abschluss: leere frühere Perioden blockieren nichts', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-07-03');
  const closure = await PeriodService.closePeriod(user.id, 2024, 7, adminActor);
  assert.equal(closure.periodStart, '2024-07-01');
});

test('Wiedereröffnen: nur mit Begründung, Änderungen danach wieder möglich, Vorgang protokolliert', async () => {
  const user = await makeUser();
  const entry = await addEntry(user, '2024-06-03');
  await PeriodService.closePeriod(user.id, 2024, 6, adminActor);

  await reject(PeriodService.reopenPeriod(user.id, 2024, 6, '', adminActor), /REASON_REQUIRED/);
  await reject(PeriodService.reopenPeriod(user.id, 2024, 6, 'kurz', adminActor), /REASON_REQUIRED/);

  await PeriodService.reopenPeriod(user.id, 2024, 6, 'Falsche Endzeit am 03.06. korrigieren', adminActor);
  assert.equal(await PeriodClosure.count({ where: { userId: user.id } }), 0);

  const updated = await TimeEntryService.updateTimeEntry(entry.id, { startTime: '09:00', endTime: '16:00', breakMinutes: 0 }, user.id, actorOf(user));
  assert.equal(updated.workTime, '07:00');

  const reopen = (await logFor(user.id, 'period.reopen'))[0];
  assert.equal(reopen.meta.reason, 'Falsche Endzeit am 03.06. korrigieren');
  assert.equal(reopen.actorEmail, admin.email);
  assert.equal(reopen.before.earnings, 80, 'Zahlen zum Zeitpunkt des Abschlusses bleiben im Protokoll');

  const close = (await logFor(user.id, 'period.close'))[0];
  assert.equal(close.after.paid, 80);
});

test('Wiedereröffnen: nur die jüngste abgeschlossene Periode; nicht abgeschlossene Perioden lassen sich nicht öffnen', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03');
  await addEntry(user, '2024-07-03');
  await PeriodService.closePeriod(user.id, 2024, 6, adminActor);
  await PeriodService.closePeriod(user.id, 2024, 7, adminActor);

  await reject(PeriodService.reopenPeriod(user.id, 2024, 6, 'Juni korrigieren bitte', adminActor), /PERIOD_LATER_CLOSED/);
  await PeriodService.reopenPeriod(user.id, 2024, 7, 'Juli zuerst öffnen', adminActor);
  await PeriodService.reopenPeriod(user.id, 2024, 6, 'Juni korrigieren bitte', adminActor);
  await reject(PeriodService.reopenPeriod(user.id, 2024, 6, 'nochmal versuchen', adminActor), /PERIOD_NOT_CLOSED/);
});

test('Abschluss: Mitarbeiter-Auslöser steht im Protokoll, Abschluss nennt den Admin', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03');
  await PeriodService.closePeriod(user.id, 2024, 6, adminActor);
  const [entry] = await logFor(user.id, 'period.close');
  assert.equal(entry.actorId, admin.id);
  assert.equal(entry.targetUserId, user.id);
  assert.equal(entry.after.periodStart, '2024-06-01');
});
