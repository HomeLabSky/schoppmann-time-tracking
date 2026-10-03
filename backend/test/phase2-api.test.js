/**
 * Tests für die App-taugliche API: Konto-Sperre, App-Sitzungen, idempotente Anlage, Konfigurationsprüfung,
 * Fehlerformat und OpenAPI-Dokument.
 */
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DB_STORAGE = path.join(os.tmpdir(), `schoppmann-phase2-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = 'unit_test_jwt_secret_with_at_least_32_chars';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_with_at_least_32_chars';

const { initDatabase, sequelize, User, TimeEntry, Session } = require('../models');
const LoginThrottleService = require('../services/loginThrottle');
const SessionService = require('../services/sessionService');
const TimeEntryService = require('../services/timeEntryService');
const { AppError } = require('../lib/errors');
const { errorHandler } = require('../middleware/errorHandler');
const { requireCsrfHeader } = require('../middleware/csrf');
const { todayString } = require('../utils/clock');
const config = require('../config');

let seq = 0;
const makeUser = (patch = {}) =>
  User.create({ email: `p2u${++seq}@schoppmann.de`, password: 'Abcdef12', name: 'Phase Zwei', ...patch });

const MINUTE = 60 * 1000;

test.before(async () => {
  await initDatabase();
  require('../app'); // registriert alle Routen für das OpenAPI-Dokument
});
test.after(async () => {
  await sequelize.close();
});

// ---------------- Konto-Sperre ----------------

test('Sperre: nach 5 Fehlversuchen 15 min, weitere Serie verdoppelt, höchstens 24 h', async () => {
  const email = 'sperre@schoppmann.de';
  const t0 = new Date('2026-01-01T10:00:00Z');
  for (let i = 1; i <= 4; i++) {
    const r = await LoginThrottleService.recordFailure(email, new Date(t0.getTime() + i * 1000));
    assert.equal(r.lockedNow, false);
  }
  const fifth = await LoginThrottleService.recordFailure(email, t0);
  assert.equal(fifth.lockedNow, true);
  assert.equal(fifth.lockedUntil.getTime() - t0.getTime(), 15 * MINUTE);

  await assert.rejects(LoginThrottleService.assertNotLocked(email, new Date(t0.getTime() + 14 * MINUTE)),
    (e) => e.code === 'ACCOUNT_LOCKED' && e.status === 429 && e.extra.retryAfter === 60);
  await LoginThrottleService.assertNotLocked(email, new Date(t0.getTime() + 16 * MINUTE));

  let last;
  const t1 = new Date(t0.getTime() + 20 * MINUTE);
  for (let i = 0; i < 5; i++) last = await LoginThrottleService.recordFailure(email, t1);
  assert.equal(last.lockedUntil.getTime() - t1.getTime(), 30 * MINUTE, 'zweite Serie: doppelt so lange');

  for (let serie = 0; serie < 10; serie++) {
    for (let i = 0; i < 5; i++) last = await LoginThrottleService.recordFailure(email, t1);
  }
  assert.equal(last.lockedUntil.getTime() - t1.getTime(), 24 * 60 * MINUTE, 'Obergrenze 24 h');
});

test('Sperre: Fehlversuche verfallen nach 24 h ohne neuen Fehlversuch; reset hebt alles auf', async () => {
  const email = 'verfall@schoppmann.de';
  const t0 = new Date('2026-02-01T10:00:00Z');
  for (let i = 0; i < 4; i++) await LoginThrottleService.recordFailure(email, t0);
  const later = await LoginThrottleService.recordFailure(email, new Date(t0.getTime() + 25 * 60 * MINUTE));
  assert.equal(later.failures, 1, 'nach 25 h beginnt die Zählung neu');

  for (let i = 0; i < 4; i++) await LoginThrottleService.recordFailure(email);
  await LoginThrottleService.reset(email);
  const fresh = await LoginThrottleService.recordFailure(email);
  assert.equal(fresh.failures, 1);
});

// ---------------- App-Sitzungen ----------------

test('App-Sitzung: längere Laufzeit, Token gilt nur auf ihrem Weg', async () => {
  const user = await makeUser();
  const app = await SessionService.createSession(user, { clientType: 'app', deviceName: 'Testgerät' });
  const web = await SessionService.createSession(user, { clientType: 'web' });

  const appRow = await Session.findByPk(app.sid);
  assert.equal(appRow.clientType, 'app');
  assert.equal(appRow.deviceName, 'Testgerät');
  const days = (row) => Math.round((row.expiresAt - row.createdAt) / (24 * 60 * MINUTE));
  assert.equal(days(appRow), config.auth.app.refreshTtlDays);
  assert.equal(days(await Session.findByPk(web.sid)), config.auth.refreshTtlDays);

  const sessionError = (code) => (e) => e.name === 'SessionError' && e.code === code;
  await assert.rejects(SessionService.rotate(app.refreshToken, { clientType: 'web' }), sessionError('INVALID_REFRESH_TOKEN'));
  await assert.rejects(SessionService.rotate(web.refreshToken, { clientType: 'app' }), sessionError('INVALID_REFRESH_TOKEN'));

  const rotated = await SessionService.rotate(app.refreshToken, { clientType: 'app' });
  assert.notEqual(rotated.refreshToken, app.refreshToken);
  assert.ok(rotated.refreshExpiresAt instanceof Date);
});

test('Sitzungsfehler sind immer 401, außer REFRESH_IN_PROGRESS (409)', () => {
  const { SessionError } = require('../services/sessionService');
  assert.equal(new SessionError('USER_INACTIVE', 'x').status, 401, 'nicht 403 wie bei der Anmeldung');
  assert.equal(new SessionError('SESSION_ENDED', 'x').status, 401);
  assert.equal(new SessionError('REFRESH_IN_PROGRESS', 'x').status, 409);
});

// ---------------- Idempotente Anlage ----------------

test('clientId: Wiederholung legt nichts doppelt an, anderer Tag ist ein Konflikt', async () => {
  const user = await makeUser();
  const entry = { userId: user.id, date: todayString(), startTime: '08:00', endTime: '10:00', breakMinutes: 0, clientId: 'abc12345-offline' };

  const first = await TimeEntryService.createTimeEntryIdempotent(entry);
  const again = await TimeEntryService.createTimeEntryIdempotent({ ...entry, startTime: '09:00' });
  assert.equal(first.replayed, false);
  assert.equal(again.replayed, true);
  assert.equal(again.entry.id, first.entry.id);
  assert.equal(again.entry.startTime, '08:00', 'bestehender Eintrag bleibt unverändert');
  assert.equal(await TimeEntry.count({ where: { userId: user.id } }), 1);

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await assert.rejects(TimeEntryService.createTimeEntryIdempotent({ ...entry, date: yesterday }), (e) => e.code === 'CLIENT_ID_CONFLICT');

  // gleiche clientId bei einem anderen Mitarbeiter ist unabhängig
  const other = await makeUser();
  const foreign = await TimeEntryService.createTimeEntryIdempotent({ ...entry, userId: other.id });
  assert.equal(foreign.replayed, false);
});

// ---------------- Fehlerformat & CSRF ----------------

const fakeRes = () => {
  const res = { headers: {}, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  return res;
};
const silentReq = { id: 'req-1', log: { error() {}, warn() {} } };

test('Error-Handler: Fachfehler mit Code, unbekannte Fehler ohne interne Details', () => {
  const res = fakeRes();
  errorHandler(new AppError('ACCOUNT_LOCKED', 'gesperrt', { extra: { retryAfter: 90 } }), silentReq, res, () => {});
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, { success: false, error: 'gesperrt', code: 'ACCOUNT_LOCKED', retryAfter: 90 });
  assert.equal(res.headers['Retry-After'], '90');

  const res2 = fakeRes();
  errorHandler(new Error('SQLITE_ERROR: no such table Users'), silentReq, res2, () => {});
  assert.equal(res2.statusCode, 500);
  assert.equal(res2.body.code, 'INTERNAL_ERROR');
  assert.equal(res2.body.requestId, 'req-1');
  assert.ok(!JSON.stringify(res2.body).includes('SQLITE'), 'keine internen Details nach außen');
});

test('CSRF: Cookie-Anfragen brauchen den Header, Bearer- und Token-Anfragen nicht', () => {
  const run = (req) => {
    let result;
    requireCsrfHeader({ get: (h) => req.headers[h.toLowerCase()], ...req }, {}, (err) => { result = err ? err.code : 'ok'; });
    return result;
  };
  assert.equal(run({ method: 'POST', path: '/timetracking', headers: {} }), 'CSRF_HEADER_MISSING');
  assert.equal(run({ method: 'POST', path: '/timetracking', headers: { 'x-csrf-protection': '1' } }), 'ok');
  assert.equal(run({ method: 'POST', path: '/timetracking', headers: { authorization: 'Bearer x' } }), 'ok');
  assert.equal(run({ method: 'POST', path: '/auth/token', headers: {} }), 'ok');
  assert.equal(run({ method: 'POST', path: '/auth/token/refresh', headers: {} }), 'ok');
  assert.equal(run({ method: 'POST', path: '/auth/login', headers: {} }), 'CSRF_HEADER_MISSING', 'Web-Login bleibt geschützt');
  assert.equal(run({ method: 'GET', path: '/timetracking', headers: {} }), 'ok');
});

// ---------------- Konfiguration ----------------

test('Konfiguration: ungültige Werte verhindern den Start und nennen die Variable', () => {
  const run = (env) => {
    try {
      execFileSync(process.execPath, ['-e', "require('./config')"], {
        cwd: path.join(__dirname, '..'),
        env: { PATH: process.env.PATH, ...env },
        stdio: 'pipe'
      });
      return 'ok';
    } catch (error) {
      return String(error.stderr);
    }
  };
  const secrets = { JWT_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), DOTENV_CONFIG_PATH: 'gibt-es-nicht' };
  assert.equal(run(secrets), 'ok');
  assert.match(run({ ...secrets, PORT: 'abc' }), /PORT/);
  assert.match(run({ ...secrets, JWT_SECRET: 'kurz' }), /JWT_SECRET muss mindestens 32 Zeichen/);
  assert.match(run({ ...secrets, NODE_ENV: 'staging' }), /NODE_ENV/);
});

// ---------------- OpenAPI ----------------

test('OpenAPI: jede Route hat Beschreibung, Berechtigung und eindeutige operationId', () => {
  const { buildOpenApiDocument, routes } = require('../lib/openapi');
  const doc = buildOpenApiDocument({ version: 'test' });
  const ids = new Set();
  let count = 0;
  for (const ops of Object.values(doc.paths)) {
    for (const op of Object.values(ops)) {
      count++;
      assert.ok(op.summary, 'summary fehlt');
      assert.ok(Array.isArray(op.security), `${op.operationId}: security fehlt`);
      assert.ok(!ids.has(op.operationId), `doppelte operationId ${op.operationId}`);
      ids.add(op.operationId);
    }
  }
  assert.equal(count, routes.length);
  assert.deepEqual(doc.paths['/auth/token'].post.security, [], 'Anmeldung ist öffentlich');
  assert.ok(doc.paths['/admin/users'].get.security.length > 0);
});

test('OpenAPI: backend/openapi.json ist aktuell (sonst: npm run openapi)', () => {
  const fs = require('node:fs');
  const { buildOpenApiDocument } = require('../lib/openapi');
  const { API_VERSION } = require('../routes');
  const file = path.join(__dirname, '..', 'openapi.json');
  const expected = JSON.stringify(buildOpenApiDocument({ version: API_VERSION }), null, 2) + '\n';
  assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), expected);
});
