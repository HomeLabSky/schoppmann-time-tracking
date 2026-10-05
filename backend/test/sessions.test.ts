/**
 * Tests für Sitzungen (Cookie-Anmeldung): Rotation, Wiederverwendungs-Erkennung, Ablauf, Widerruf.
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import config from '../src/config';
import { closeDb, initDatabase } from '../src/db';
import { db } from '../src/db/client';
import { sessions, users, type SessionRow, type User } from '../src/db/schema';
import { AuditService } from '../src/services/auditService';
import { AuthService } from '../src/services/authService';
import { SessionService } from '../src/services/sessionService';
import { describeUserAgent } from '../src/utils/userAgent';
import { makeUser as createUser } from './helpers';

const makeUser = (patch: Partial<User> = {}) => createUser({ name: 'Session Test', ...patch }, 'sess');
const sessionRow = (sid: string): SessionRow | undefined => db().select().from(sessions).where(eq(sessions.id, sid)).get();
const updateUser = (user: User, patch: Partial<User>) => db().update(users).set(patch).where(eq(users.id, user.id)).run();
const updateSession = (sid: string, patch: Partial<SessionRow>) => db().update(sessions).set(patch).where(eq(sessions.id, sid)).run();

const rejectCode = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (error: { name?: string; code?: string }) => error.name === 'SessionError' && error.code === code, `erwartet ${code}`);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.before(async () => {
  await initDatabase();
});
test.after(() => {
  closeDb();
});

test('Sitzung anlegen: nur ein Prüfwert in der Datenbank, nie das Token selbst', async () => {
  const user = await makeUser();
  const { sid, refreshToken, accessToken } = await SessionService.createSession(user, { ip: '10.0.0.5', userAgent: 'Test-Browser' });

  const secret = refreshToken.split('.')[1];
  const row = sessionRow(sid)!;
  assert.equal(row.userId, user.id);
  assert.equal(row.ip, '10.0.0.5');
  assert.ok(!JSON.stringify(row).includes(secret), 'Geheimnis steht nicht im Klartext in der Datenbank');
  assert.match(row.refreshHash, /^[0-9a-f]{64}$/);

  const payload = jwt.decode(accessToken) as JwtPayload & { exp: number; iat: number };
  assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'sid', 'userId'], 'Token enthält nur IDs, keine Rolle oder E-Mail');
  assert.equal(payload.exp - payload.iat, config.auth.accessTtlSeconds);
});

test('Zugriff: Rolle und Status kommen aus der Datenbank, nicht aus dem Token', async () => {
  const user = await makeUser({ role: 'mitarbeiter' });
  const { accessToken, sid } = await SessionService.createSession(user);

  const first = await SessionService.authenticate(accessToken);
  assert.equal(first.sid, sid);
  assert.equal(first.user.role, 'mitarbeiter');

  updateUser(user, { role: 'admin' });
  assert.equal((await SessionService.authenticate(accessToken)).user.role, 'admin', 'Rollenänderung wirkt sofort');

  updateUser(user, { isActive: false });
  await rejectCode(SessionService.authenticate(accessToken), 'USER_INACTIVE');
});

test('Zugriff: abgelaufenes, gefälschtes und fremd signiertes Token', async () => {
  const user = await makeUser();
  const { accessToken, sid } = await SessionService.createSession(user);

  const expired = jwt.sign({ userId: user.id, sid }, config.jwt.secret, { expiresIn: -10, issuer: 'schoppmann-timetracking', audience: 'schoppmann-users' });
  await rejectCode(SessionService.authenticate(expired), 'TOKEN_EXPIRED');

  await rejectCode(SessionService.authenticate(accessToken.slice(0, -4) + 'abcd'), 'INVALID_TOKEN');
  const wrongSecret = jwt.sign({ userId: user.id, sid }, 'ein_ganz_anderes_geheimnis_mit_32_zeichen_xx', { issuer: 'schoppmann-timetracking', audience: 'schoppmann-users' });
  await rejectCode(SessionService.authenticate(wrongSecret), 'INVALID_TOKEN');
  const wrongAudience = jwt.sign({ userId: user.id, sid }, config.jwt.secret, { issuer: 'schoppmann-timetracking', audience: 'andere' });
  await rejectCode(SessionService.authenticate(wrongAudience), 'INVALID_TOKEN');
  const noSid = jwt.sign({ userId: user.id }, config.jwt.secret, { issuer: 'schoppmann-timetracking', audience: 'schoppmann-users' });
  await rejectCode(SessionService.authenticate(noSid), 'INVALID_TOKEN');
});

test('Zugriff: Token einer anderen Person mit fremder Sitzungs-ID wird abgelehnt', async () => {
  const alice = await makeUser();
  const bob = await makeUser();
  const aliceSession = await SessionService.createSession(alice);
  const forged = jwt.sign({ userId: bob.id, sid: aliceSession.sid }, config.jwt.secret, { issuer: 'schoppmann-timetracking', audience: 'schoppmann-users' });
  await rejectCode(SessionService.authenticate(forged), 'SESSION_ENDED');
});

test('Rotation: neues Token-Paar, altes Token gilt kurz als "in Arbeit"', async () => {
  const user = await makeUser();
  const created = await SessionService.createSession(user);

  const rotated = await SessionService.rotate(created.refreshToken);
  assert.notEqual(rotated.refreshToken, created.refreshToken);
  assert.equal(rotated.sid, created.sid, 'dieselbe Sitzung');
  assert.equal((await SessionService.authenticate(rotated.accessToken)).user.id, user.id);

  // Zwei Tabs: das zuvor benutzte Token wird innerhalb der Schonfrist nicht als Diebstahl gewertet
  await rejectCode(SessionService.rotate(created.refreshToken), 'REFRESH_IN_PROGRESS');
  assert.equal((await SessionService.authenticate(rotated.accessToken)).user.id, user.id, 'Sitzung bleibt gültig');
  // … und das neue Token funktioniert weiter
  const again = await SessionService.rotate(rotated.refreshToken);
  assert.notEqual(again.refreshToken, rotated.refreshToken);
});

test('Wiederverwendung nach der Schonfrist beendet die Sitzung (Diebstahlverdacht)', async () => {
  const user = await makeUser();
  const created = await SessionService.createSession(user);
  const rotated = await SessionService.rotate(created.refreshToken);

  const grace = config.auth.refreshGraceSeconds;
  config.auth.refreshGraceSeconds = 0;
  await sleep(30);
  try {
    await assert.rejects(SessionService.rotate(created.refreshToken), (error: { code?: string; userId?: number }) => error.code === 'REFRESH_TOKEN_REUSED' && error.userId === user.id);
  } finally {
    config.auth.refreshGraceSeconds = grace;
  }

  const row = sessionRow(created.sid)!;
  assert.ok(row.revokedAt);
  assert.equal(row.revokedReason, 'reuse_detected');
  await rejectCode(SessionService.rotate(rotated.refreshToken), 'INVALID_REFRESH_TOKEN');
  await rejectCode(SessionService.authenticate(rotated.accessToken), 'SESSION_ENDED');
});

test('Ungültige Erneuerungs-Tokens werden abgelehnt, ohne fremde Sitzungen zu beenden', async () => {
  const user = await makeUser();
  const { sid, refreshToken } = await SessionService.createSession(user);

  for (const bad of [undefined, '', 'nur-ein-teil', '.leer', `${sid}.`, `${sid}.falsch`, 'unbekannt.geheimnis', 12345]) {
    await rejectCode(SessionService.rotate(bad), 'INVALID_REFRESH_TOKEN');
  }
  assert.equal(sessionRow(sid)!.revokedAt, null, 'falsches Geheimnis sperrt die echte Sitzung nicht');
  await SessionService.rotate(refreshToken); // echtes Token funktioniert weiterhin
});

test('Ablauf: gleitend 7 Tage, absolut begrenzt', async () => {
  const user = await makeUser();
  const created = await SessionService.createSession(user);

  const row = sessionRow(created.sid)!;
  const day = 86400000;
  assert.ok(Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - config.auth.refreshTtlDays * day) < 5000);
  assert.ok(Math.abs(row.absoluteExpiresAt.getTime() - row.createdAt.getTime() - config.auth.sessionMaxDays * day) < 5000);

  // Erneuerung verlängert höchstens bis zum absoluten Ende
  updateSession(created.sid, { absoluteExpiresAt: new Date(Date.now() + 2 * day) });
  const rotated = await SessionService.rotate(created.refreshToken);
  const after = sessionRow(created.sid)!;
  assert.ok(after.expiresAt <= after.absoluteExpiresAt, 'gleitende Verlängerung überschreitet das absolute Ende nicht');

  // abgelaufen (gleitend)
  updateSession(created.sid, { expiresAt: new Date(Date.now() - 1000) });
  await rejectCode(SessionService.rotate(rotated.refreshToken), 'INVALID_REFRESH_TOKEN');
  assert.equal(sessionRow(created.sid)!.revokedReason, 'expired');
});

test('Erneuerung für gesperrte Benutzer schlägt fehl und beendet die Sitzung', async () => {
  const user = await makeUser();
  const created = await SessionService.createSession(user);
  updateUser(user, { isActive: false });
  await rejectCode(SessionService.rotate(created.refreshToken), 'USER_INACTIVE');
  assert.ok(sessionRow(created.sid)!.revokedAt);
});

test('Widerruf: alle Sitzungen eines Benutzers, optional mit Ausnahme der aktuellen', async () => {
  const user = await makeUser();
  const other = await makeUser();
  const a = await SessionService.createSession(user);
  const b = await SessionService.createSession(user);
  const c = await SessionService.createSession(user);
  const foreign = await SessionService.createSession(other);

  const count = SessionService.revokeAllForUser(user.id, { exceptSid: b.sid, reason: 'password_changed' });
  assert.equal(count, 2);
  await rejectCode(SessionService.authenticate(a.accessToken), 'SESSION_ENDED');
  await rejectCode(SessionService.authenticate(c.accessToken), 'SESSION_ENDED');
  assert.equal((await SessionService.authenticate(b.accessToken)).sid, b.sid);
  assert.equal((await SessionService.authenticate(foreign.accessToken)).user.id, other.id, 'andere Benutzer unberührt');

  assert.equal(SessionService.revokeAllForUser(user.id, { reason: 'x' }), 1, 'bereits beendete werden nicht erneut gezählt');
  assert.equal(await SessionService.revoke(b.sid), false, 'idempotent');
});

test('Abmelden: nur mit Besitznachweis (Erneuerungs-Token oder gültig signiertes Zugriffs-Token)', async () => {
  const user = await makeUser();
  const target = await SessionService.createSession(user);

  assert.equal(await SessionService.logout({}), null);
  assert.equal(await SessionService.logout({ refreshToken: `${target.sid}.falsch` }), null, 'falsches Geheimnis');
  assert.equal(await SessionService.logout({ accessToken: 'unsinn' }), null, 'ungültiges Zugriffs-Token');
  assert.equal(await SessionService.authenticate(target.accessToken).then((r) => r.sid), target.sid, 'Sitzung noch aktiv');

  // abgelaufenes, aber echt signiertes Zugriffs-Token reicht (Abmelden soll immer möglich sein)
  const expired = jwt.sign({ userId: user.id, sid: target.sid }, config.jwt.secret, { expiresIn: -10, issuer: 'schoppmann-timetracking', audience: 'schoppmann-users' });
  const ended = (await SessionService.logout({ accessToken: expired }))!;
  assert.deepEqual({ sid: ended.sid, userId: ended.userId, email: ended.email }, { sid: target.sid, userId: user.id, email: user.email });
  await rejectCode(SessionService.authenticate(target.accessToken), 'SESSION_ENDED');

  // über das (rotierte) Erneuerungs-Token
  const second = await SessionService.createSession(user);
  const rotated = await SessionService.rotate(second.refreshToken);
  const viaRefresh = await SessionService.logout({ refreshToken: rotated.refreshToken });
  assert.equal(viaRefresh?.sid, second.sid);
});

test('Aufräumen: nur lange beendete oder abgelaufene Sitzungen werden gelöscht', async () => {
  const user = await makeUser();
  const old = await SessionService.createSession(user);
  const recent = await SessionService.createSession(user);
  const active = await SessionService.createSession(user);
  const day = 86400000;

  updateSession(old.sid, { revokedAt: new Date(Date.now() - 10 * day) });
  updateSession(recent.sid, { revokedAt: new Date(Date.now() - 1 * day) });

  SessionService.purgeOld();
  assert.equal(sessionRow(old.sid), undefined, 'vor 10 Tagen beendet → gelöscht');
  assert.ok(sessionRow(recent.sid), 'gestern beendet → bleibt (Nachvollziehbarkeit)');
  assert.ok(sessionRow(active.sid), 'aktive Sitzung bleibt');
});

// ---------- Sitzungsübersicht und „überall abmelden“ ----------

const EDGE_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('Gerätebezeichnung aus dem User-Agent', () => {
  assert.equal(describeUserAgent(EDGE_WINDOWS), 'Edge unter Windows');
  assert.equal(describeUserAgent(SAFARI_IPHONE), 'Safari unter iOS');
  assert.equal(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'), 'Firefox unter Linux');
  assert.equal(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'), 'Chrome unter macOS');
  assert.equal(describeUserAgent('okhttp/4.12.0'), null);
  assert.equal(describeUserAgent(null), null);
});

test('Übersicht: nur laufende eigene Sitzungen, aktuelle zuerst, ohne Token-Prüfwerte', async () => {
  const user = await makeUser();
  const other = await makeUser();
  const web = await SessionService.createSession(user, { userAgent: EDGE_WINDOWS, ip: '10.0.0.7' });
  const app = await SessionService.createSession(user, { clientType: 'app', deviceName: 'iPhone von Anna', userAgent: 'okhttp/4.12.0' });
  const ended = await SessionService.createSession(user, { userAgent: SAFARI_IPHONE });
  const expired = await SessionService.createSession(user, { userAgent: SAFARI_IPHONE });
  await SessionService.createSession(other, { userAgent: EDGE_WINDOWS });
  SessionService.revokeSync(ended.sid, 'logout');
  updateSession(expired.sid, { expiresAt: new Date(Date.now() - 1000) });
  updateSession(web.sid, { lastUsedAt: new Date(Date.now() - 60_000) });

  const list = AuthService.listSessions(user.id, web.sid);
  assert.deepEqual(list.map((s) => s.id), [web.sid, app.sid], 'aktuelle zuerst, beendete/abgelaufene/fremde fehlen');
  assert.equal(list[0]?.current, true);
  assert.equal(list[0]?.label, 'Edge unter Windows');
  assert.equal(list[0]?.ip, '10.0.0.7');
  assert.equal(list[1]?.label, 'iPhone von Anna', 'Gerätename der App hat Vorrang');
  assert.equal(list[1]?.clientType, 'app');
  assert.ok(!('refreshHash' in (list[0] ?? {})) && !('previousHash' in (list[0] ?? {})));
});

test('Zuletzt aktiv: wird bei Anfragen höchstens alle 5 Minuten fortgeschrieben', async () => {
  const user = await makeUser();
  const { sid, accessToken } = await SessionService.createSession(user);
  const recent = new Date(Date.now() - 60_000);
  updateSession(sid, { lastUsedAt: recent });
  await SessionService.authenticate(accessToken);
  assert.equal(sessionRow(sid)?.lastUsedAt.getTime(), recent.getTime(), 'innerhalb von 5 Minuten kein Schreibzugriff');

  updateSession(sid, { lastUsedAt: new Date(Date.now() - 10 * 60_000) });
  await SessionService.authenticate(accessToken);
  assert.ok(Date.now() - (sessionRow(sid)?.lastUsedAt.getTime() ?? 0) < 5000, 'fortgeschrieben');
});

test('Einzelne Sitzung beenden: nur eigene laufende, nicht die aktuelle; wirkt sofort; protokolliert', async () => {
  const user = await makeUser();
  const other = await makeUser();
  const current = await SessionService.createSession(user);
  const phone = await SessionService.createSession(user, { clientType: 'app', deviceName: 'Handy' });
  const foreign = await SessionService.createSession(other);
  const actor = { id: user.id, email: user.email };

  assert.throws(() => AuthService.revokeSession(user.id, current.sid, current.sid, actor), { code: 'CANNOT_REVOKE_CURRENT_SESSION' });
  assert.throws(() => AuthService.revokeSession(user.id, foreign.sid, current.sid, actor), { code: 'SESSION_NOT_FOUND' });
  assert.equal(sessionRow(foreign.sid)?.revokedAt, null, 'fremde Sitzung unberührt');

  AuthService.revokeSession(user.id, phone.sid, current.sid, actor);
  assert.equal(sessionRow(phone.sid)?.revokedReason, 'revoked_by_user');
  await rejectCode(SessionService.authenticate(phone.accessToken), 'SESSION_ENDED');
  await rejectCode(SessionService.rotate(phone.refreshToken, { clientType: 'app' }), 'INVALID_REFRESH_TOKEN');
  assert.throws(() => AuthService.revokeSession(user.id, phone.sid, current.sid, actor), { code: 'SESSION_NOT_FOUND' }, 'schon beendet');
  await SessionService.authenticate(current.accessToken); // aktuelle läuft weiter

  const log = await AuditService.list({ userId: user.id, action: 'auth.session_revoke', limit: 10 });
  assert.equal(log.entries.length, 1);
  assert.deepEqual(log.entries[0]?.meta, { client: 'app', device: 'Handy' });
});

test('Überall abmelden: alle anderen eigenen Sitzungen enden, aktuelle und fremde bleiben; Admin beendet alle', async () => {
  const user = await makeUser();
  const other = await makeUser();
  const admin = await makeUser({ role: 'admin' });
  const current = await SessionService.createSession(user);
  const laptop = await SessionService.createSession(user);
  const phone = await SessionService.createSession(user, { clientType: 'app' });
  const foreign = await SessionService.createSession(other);

  assert.equal(AuthService.revokeOtherSessions(user.id, current.sid, { id: user.id, email: user.email }), 2);
  await rejectCode(SessionService.authenticate(laptop.accessToken), 'SESSION_ENDED');
  await rejectCode(SessionService.authenticate(phone.accessToken), 'SESSION_ENDED');
  await SessionService.authenticate(current.accessToken);
  await SessionService.authenticate(foreign.accessToken);
  assert.equal(AuthService.revokeOtherSessions(user.id, current.sid, { id: user.id, email: user.email }), 0, 'nichts mehr zu beenden');

  assert.equal(AuthService.revokeAllSessionsByAdmin(user.id, { id: admin.id, email: admin.email }), 1);
  await rejectCode(SessionService.authenticate(current.accessToken), 'SESSION_ENDED');
  assert.equal(sessionRow(current.sid)?.revokedReason, 'revoked_by_admin');
  assert.equal(db().select().from(users).where(eq(users.id, user.id)).get()?.isActive, true, 'Konto bleibt aktiv');
  assert.throws(() => AuthService.revokeAllSessionsByAdmin(999_999, { id: admin.id }), { code: 'USER_NOT_FOUND' });

  const log = await AuditService.list({ userId: user.id, action: 'auth.sessions_revoke', limit: 10 });
  assert.deepEqual(log.entries.map((e) => [e.action, (e.meta as { revokedCount: number }).revokedCount, e.actorId]), [
    ['auth.sessions_revoke_all', 1, admin.id],
    ['auth.sessions_revoke_others', 0, user.id],
    ['auth.sessions_revoke_others', 2, user.id]
  ]);
});
