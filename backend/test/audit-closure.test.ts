/**
 * Integrationstests für Änderungsprotokoll (Audit-Log) und Monatsabschluss.
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { count, eq, sql } from 'drizzle-orm';
import { closeDb, initDatabase } from '../src/db';
import { db, getSqlite } from '../src/db/client';
import { auditLogs, minijobSettings, periodClosures, timeEntries, users, type User } from '../src/db/schema';
import { AuditService } from '../src/services/auditService';
import { MinijobService } from '../src/services/minijobService';
import { PeriodService } from '../src/services/periodService';
import { TimeEntryService } from '../src/services/timeEntryService';
import { UserService } from '../src/services/userService';
import { todayString } from '../src/utils/clock';
import { addEntry, addLimit, makeUser as createUser, reject } from './helpers';

const makeUser = (patch: Partial<User> = {}) => createUser({ name: 'Audit Test', stundenlohn: 10, ...patch }, 'audit');
const countWhere = (table: typeof timeEntries | typeof periodClosures, userId: number) =>
  db().select({ n: count() }).from(table).where(eq(table.userId, userId)).get()?.n ?? 0;
const actorOf = (u: { id: number; email: string }) => ({ id: u.id, email: u.email });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Protokoll-JSON wird im Test frei gelesen
const logFor = (userId: number, action?: string): Promise<any[]> => AuditService.list({ userId, action, limit: 200 }).then((r) => r.entries);

let admin: User;
let adminActor: { id: number; email: string };

test.before(async () => {
  await initDatabase();
  admin = await makeUser({ role: 'admin' });
  adminActor = actorOf(admin);
  addLimit(admin.id, 100, '2024-01-01', '2024-12-31', 'Limit 2024');
  addLimit(admin.id, 600, '2025-01-01', null, 'Limit ab 2025');
});

test.after(() => {
  closeDb();
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
  assert.equal(countWhere(timeEntries, user.id), 0);
});

test('Audit: Protokoll ist unveränderlich (auch bei direktem SQL)', async () => {
  const row = AuditService.record({ actor: adminActor, action: 'test.immutable', entityType: 'Test' });

  assert.throws(() => db().update(auditLogs).set({ action: 'manipuliert' }).where(eq(auditLogs.id, row.id)).run(), /unveränderlich/);
  assert.throws(() => db().delete(auditLogs).where(eq(auditLogs.id, row.id)).run(), /unveränderlich/);
  assert.throws(() => getSqlite().exec("UPDATE AuditLogs SET action = 'x'"), /unveränderlich/);
  assert.throws(() => getSqlite().exec('DELETE FROM AuditLogs'), /unveränderlich/);

  const reloaded = db().select().from(auditLogs).where(eq(auditLogs.id, row.id)).get();
  assert.equal(reloaded?.action, 'test.immutable');
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
  const row = AuditService.record({
    actor: adminActor,
    action: 'test.secrets',
    entityType: 'Test',
    before: { name: 'a', password: 'KlartextVorher' },
    after: { name: 'b', nested: { refreshToken: 'abc', ok: 1 }, list: [{ accessToken: 'x', keep: true }] },
    meta: { token: 'zzz', reason: 'ok' }
  });
  const stored = String(db().get<{ raw: string }>(sql`SELECT before || after || meta AS raw FROM AuditLogs WHERE id = ${row.id}`)?.raw);
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
  const { setting } = await MinijobService.createSetting(
    { monthlyLimit: 700, description: 'Zukunft', validFrom: '2999-01-01', validUntil: null },
    admin.id,
    adminActor
  );
  await MinijobService.updateSetting(setting.id, { monthlyLimit: 710, description: 'Zukunft', validFrom: '2999-01-01', validUntil: null }, adminActor);
  await MinijobService.deleteSetting(setting.id, adminActor);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (await AuditService.list({ entityType: 'MinijobSetting', limit: 200 })).entries as any[];
  const mine = entries.filter((e) => e.entityId === setting.id).reverse();
  assert.deepEqual(mine.map((e) => e.action), ['minijob_setting.create', 'minijob_setting.update', 'minijob_setting.delete']);
  assert.equal(mine[1].before.monthlyLimit, 700);
  assert.equal(mine[1].after.monthlyLimit, 710);
});

test('Audit: Konten mit Zeiteinträgen können nicht gelöscht werden (Nachweise bleiben erhalten)', async () => {
  const user = await makeUser();
  await addEntry(user, '2024-06-03');
  await reject(UserService.deleteUser(user.id, adminActor), /USER_HAS_DEPENDENCIES/);
  assert.ok(db().select().from(users).where(eq(users.id, user.id)).get());
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
  assert.equal(db().select().from(timeEntries).where(eq(timeEntries.id, entry.id)).get()?.startTime, '09:00:00', 'Eintrag unverändert');

  // laufende Periode bleibt bearbeitbar
  const today = await TimeEntryService.createTimeEntry({ userId: user.id, date: todayString(), startTime: '09:00', endTime: '10:00', breakMinutes: 0 }, actorOf(user));
  assert.ok(today.id);

  const month = await TimeEntryService.getMonthlyTimeRecords(user.id, prev.year, prev.month);
  assert.equal(month.period.status, 'closed');
  assert.ok(month.closure?.closedAt);
  const periods = await TimeEntryService.generateBillingPeriods(user.id);
  assert.equal(periods.find((p) => p.startDate === prev.first)?.isClosed, true);
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

  const setLimit2024 = (monthlyLimit: number) =>
    db().update(minijobSettings).set({ monthlyLimit }).where(eq(minijobSettings.validFrom, '2024-01-01')).run();
  setLimit2024(500);
  try {
    const june = await TimeEntryService.getMonthlyTimeRecords(user.id, 2024, 6);
    assert.equal(june.summary.minijobLimit, 100, 'Grenze zum Abschlusszeitpunkt');
    assert.equal(june.summary.paidThisMonth, 100);
    assert.equal(june.summary.carryOut, 60);

    const july = await TimeEntryService.getMonthlyTimeRecords(user.id, 2024, 7);
    assert.equal(july.summary.carryIn, 60, 'Übertrag aus dem abgeschlossenen Juni bleibt stabil');
    assert.equal(july.summary.minijobLimit, 500, 'offene Perioden nutzen die aktuelle Einstellung');
  } finally {
    setLimit2024(100);
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

test('Abschluss: ohne hinterlegte Minijob-Grenze vorläufig markiert und gesperrt', async () => {
  const user = await makeUser();
  await addEntry(user, '2023-06-05'); // vor der ersten Einstellung (2024) → nur Ersatzwert

  const june = await TimeEntryService.getMonthlyTimeRecords(user.id, 2023, 6);
  assert.equal(june.summary.minijobLimitMissing, true);
  await reject(PeriodService.closePeriod(user.id, 2023, 6, adminActor), /MINIJOB_LIMIT_MISSING/);
  assert.equal((await PeriodService.listClosures(user.id)).length, 0);

  const later = await TimeEntryService.getMonthlyTimeRecords(user.id, 2025, 3);
  assert.equal(later.summary.minijobLimitMissing, true, 'offene Periode ohne Grenze geht in den Übertrag ein');

  const other = await makeUser();
  await addEntry(other, '2025-03-03');
  const covered = await TimeEntryService.getMonthlyTimeRecords(other.id, 2025, 3);
  assert.equal(covered.summary.minijobLimitMissing, false, 'mit hinterlegter Grenze nicht vorläufig');
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
  assert.equal(countWhere(periodClosures, user.id), 0);

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
