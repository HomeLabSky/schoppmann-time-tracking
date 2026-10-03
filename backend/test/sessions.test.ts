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
import { SessionService } from '../src/services/sessionService';
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

  const count = await SessionService.revokeAllForUser(user.id, { exceptSid: b.sid, reason: 'password_changed' });
  assert.equal(count, 2);
  await rejectCode(SessionService.authenticate(a.accessToken), 'SESSION_ENDED');
  await rejectCode(SessionService.authenticate(c.accessToken), 'SESSION_ENDED');
  assert.equal((await SessionService.authenticate(b.accessToken)).sid, b.sid);
  assert.equal((await SessionService.authenticate(foreign.accessToken)).user.id, other.id, 'andere Benutzer unberührt');

  assert.equal(await SessionService.revokeAllForUser(user.id, { reason: 'x' }), 1, 'bereits beendete werden nicht erneut gezählt');
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

  await SessionService.purgeOld();
  assert.equal(sessionRow(old.sid), undefined, 'vor 10 Tagen beendet → gelöscht');
  assert.ok(sessionRow(recent.sid), 'gestern beendet → bleibt (Nachvollziehbarkeit)');
  assert.ok(sessionRow(active.sid), 'aktive Sitzung bleibt');
});
