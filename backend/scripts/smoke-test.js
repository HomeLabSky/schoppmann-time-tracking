/**
 * Backend Smoke-Test (ohne externes Test-Framework).
 *
 * Bootet die Express-App (app.js) auf einem zufälligen Port gegen eine
 * temporäre SQLite-Datenbank und ruft die wichtigsten Endpunkte jeder
 * Domäne auf (Auth, Zeiterfassung, Employee, Admin, Minijob, Setup).
 * Dient als Regressionsnetz für das Backend-Refactoring: prüft, dass der
 * öffentliche API-Vertrag ({ success, data, message }) erhalten bleibt.
 *
 * Aufruf:  npm run smoke   (oder: node scripts/smoke-test.js)
 * Exit-Code 0 = alle Checks grün, 1 = mindestens ein Check rot.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

// Test-Umgebung VOR dem Laden von config/app setzen.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const dbFile = path.join(os.tmpdir(), `schoppmann-smoke-${Date.now()}.sqlite`);
process.env.DB_STORAGE = dbFile;
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke_test_jwt_secret_min_32_chars_long_value';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smoke_test_refresh_secret_min_32_chars_long_value';
// Selbstregistrierung ist produktiv standardmäßig aus; der Test schaltet sie gezielt ein.
process.env.ALLOW_REGISTRATION = 'true';
// Der Test meldet sich oft an: Rate-Limits (pro IP) hochsetzen
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '10000';

const app = require('../app');
const config = require('../config');
const { initDatabase, sequelize, User, TimeEntry } = require('../models');

const ADMIN_EMAIL = 'smoke.admin@schoppmann.de';
const ADMIN_PASSWORD = 'SmokeAdmin1x';

let passed = 0;
let failed = 0;
const check = (name, cond, extra) => {
  if (cond) {
    passed++;
    console.log('  ✅', name);
  } else {
    failed++;
    console.error('  ❌', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : '');
  }
};

const today = () => new Date().toISOString().split('T')[0];

async function main() {
  await initDatabase();
  app.locals.dbConnected = true;

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Cookie-Speicher je "Browser-Sitzung"
  const newSession = () => ({ jar: new Map() });
  const applySetCookies = (jar, lines) => {
    for (const line of lines) {
      const [pair, ...attrs] = line.split(';').map((x) => x.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAge = attrs.find((a) => /^max-age=/i.test(a));
      const expires = attrs.find((a) => /^expires=/i.test(a));
      const gone = value === '' ||
        (maxAge && parseInt(maxAge.split('=')[1], 10) <= 0) ||
        (expires && new Date(expires.split('=')[1]).getTime() < Date.now());
      if (gone) jar.delete(name); else jar.set(name, value);
    }
  };

  // token/session: Cookie-Speicher; Cookies aus der Antwort werden übernommen (wie im Browser)
  const api = async (method, endpoint, { token, session, body, csrf = true, headers = {} } = {}) => {
    const owner = session || token;
    const cookie = owner ? [...owner.jar].map(([k, v]) => `${k}=${v}`).join('; ') : '';
    const res = await fetch(base + endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Protection': '1' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let json = null;
    try { json = await res.json(); } catch { /* leerer Body */ }
    const setCookies = res.headers.getSetCookie();
    if (owner) applySetCookies(owner.jar, setCookies);
    return { status: res.status, json, setCookies };
  };

  try {
    // ---- Infra ----
    console.log('\n[Infrastruktur]');
    const health = await api('GET', '/health');
    check('GET /health 200', health.status === 200, health.status);
    const apiInfo = await api('GET', '/api/');
    check('GET /api/ liefert version', apiInfo.json && apiInfo.json.version === '2.0.0', apiInfo.json);

    // ---- Entfernte Wartungs-/Setup-Routen dürfen nicht mehr erreichbar sein ----
    console.log('\n[Sicherheit]');
    const gone1 = await api('GET', '/api/setup/create-first-admin');
    check('GET /api/setup/create-first-admin entfernt (404)', gone1.status === 404, gone1.status);
    const gone2 = await api('POST', '/api/setup/dev-reset');
    check('POST /api/setup/dev-reset entfernt (404)', gone2.status === 404, gone2.status);
    const gone3 = await api('GET', '/api/version');
    check('GET /api/version entfernt (404)', gone3.status === 404, gone3.status);
    check('GET /health ohne Versions-/Pfad-Details', health.json && health.json.version === undefined && health.json.database?.storage === undefined, health.json);

    // Der erste Admin entsteht per CLI (npm run admin:create) – hier direkt über das Model.
    await User.create({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'Smoke Admin', role: 'admin', isActive: true });

    // ---- Auth: Mitarbeiter registrieren + login ----
    console.log('\n[Auth]');
    const empCreds = { email: 'smoke.employee@schoppmann.de', password: 'Test1234', name: 'Smoke Tester' };
    const register = await api('POST', '/api/auth/register', { body: empCreds });
    check('Registrierung 201 + Anmelde-Cookies', register.status === 201 && register.setCookies.length === 2, register.json);

    const empToken = newSession();
    const login = await api('POST', '/api/auth/login', { session: empToken, body: { email: empCreds.email, password: empCreds.password } });
    check('Login 200 + Anmelde-Cookies', login.status === 200 && login.setCookies.length === 2, login.status);
    check('Login liefert user ohne Passwort', login.json?.data?.user && login.json.data.user.password === undefined, login.json?.data?.user);

    const noToken = await api('GET', '/api/auth/profile');
    check('Profil ohne Token abgewiesen (401/403)', noToken.status === 401 || noToken.status === 403, noToken.status);

    const profile = await api('GET', '/api/auth/profile', { token: empToken });
    check('Profil mit Token 200', profile.status === 200 && profile.json?.data?.user?.email === empCreds.email, profile.json);

    // Fehlerpfade (Vertrag: Status + code)
    config.allowRegistration = false;
    const regOff = await api('POST', '/api/auth/register', { body: { ...empCreds, email: 'nope@schoppmann.de' } });
    check('Registrierung deaktiviert → 403 REGISTRATION_DISABLED', regOff.status === 403 && regOff.json?.code === 'REGISTRATION_DISABLED', regOff.json);
    config.allowRegistration = true;

    const dupReg = await api('POST', '/api/auth/register', { body: empCreds });
    check('Doppelte Registrierung 409 EMAIL_EXISTS', dupReg.status === 409 && dupReg.json?.code === 'EMAIL_EXISTS', dupReg.json);
    const badLogin = await api('POST', '/api/auth/login', { body: { email: empCreds.email, password: 'Falsch123' } });
    check('Falsches Passwort 401 INVALID_CREDENTIALS', badLogin.status === 401 && badLogin.json?.code === 'INVALID_CREDENTIALS', badLogin.json);

    // ---- Zeiterfassung CRUD ----
    console.log('\n[Zeiterfassung]');
    const month = today().slice(0, 7);
    const created = await api('POST', '/api/timetracking', {
      token: empToken,
      body: { date: today(), startTime: '08:00', endTime: '16:30', breakMinutes: 30, description: 'Smoke' }
    });
    check('Zeiteintrag erstellt 201', created.status === 201 && !!created.json?.data?.entry?.id, created.json);
    const entryId = created.json?.data?.entry?.id;

    const dupEntry = await api('POST', '/api/timetracking', {
      token: empToken,
      body: { date: today(), startTime: '10:00', endTime: '12:00', breakMinutes: 0 }
    });
    check('Doppelter Zeiteintrag 409 ENTRY_EXISTS', dupEntry.status === 409 && dupEntry.json?.code === 'ENTRY_EXISTS', dupEntry.json);

    const list = await api('GET', `/api/timetracking?month=${month}`, { token: empToken });
    check('Monatsliste liefert records', Array.isArray(list.json?.data?.records), list.json);

    const single = await api('GET', `/api/timetracking/${entryId}`, { token: empToken });
    check('Einzelner Eintrag 200', single.status === 200 && single.json?.data?.entry?.id === entryId, single.status);

    const updated = await api('PUT', `/api/timetracking/${entryId}`, {
      token: empToken,
      body: { startTime: '09:00', endTime: '17:00', breakMinutes: 45 }
    });
    check('Eintrag aktualisiert 200', updated.status === 200 && updated.json?.success === true, updated.json);

    const deleted = await api('DELETE', `/api/timetracking/${entryId}`, { token: empToken });
    check('Eintrag gelöscht 200', deleted.status === 200 && deleted.json?.success === true, deleted.status);

    // ---- Employee-Routen ----
    console.log('\n[Employee]');
    const empProfile = await api('GET', '/api/employee/profile', { token: empToken });
    check('Employee-Profil 200', empProfile.status === 200, empProfile.status);
    const empSettings = await api('PUT', '/api/employee/settings', {
      token: empToken,
      body: { stundenlohn: 13.5, abrechnungStart: 1, abrechnungEnde: 31 }
    });
    check('Employee-Settings aktualisiert', empSettings.status === 200 && empSettings.json?.data?.settings?.stundenlohn === 13.5, empSettings.json);
    const empSettingsGet = await api('GET', '/api/employee/settings', { token: empToken });
    check('Employee-Settings gelesen', empSettingsGet.status === 200 && !!empSettingsGet.json?.data?.userInfo, empSettingsGet.json);
    const empDashboard = await api('GET', '/api/employee/dashboard', { token: empToken });
    check('Employee-Dashboard 200', empDashboard.status === 200 && !!empDashboard.json?.data?.user, empDashboard.status);
    const empAccount = await api('GET', '/api/employee/account-status', { token: empToken });
    check('Account-Status active', empAccount.status === 200 && empAccount.json?.data?.status?.statusCode === 'active', empAccount.json);

    // ---- Admin-Routen ----
    console.log('\n[Admin]');
    const adminToken = newSession();
    const adminLogin = await api('POST', '/api/auth/login', { session: adminToken, body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    check('Admin-Login 200', adminLogin.status === 200 && adminLogin.json?.data?.user?.role === 'admin', adminLogin.json?.data?.user);

    const adminForbidden = await api('GET', '/api/admin/users', { token: empToken });
    check('Mitarbeiter ohne Adminrecht abgewiesen 403', adminForbidden.status === 403, adminForbidden.status);

    const users = await api('GET', '/api/admin/users', { token: adminToken });
    check('Admin User-Liste 200', users.status === 200 && Array.isArray(users.json?.data?.users), users.status);

    const createUser = await api('POST', '/api/admin/users', {
      token: adminToken,
      body: { email: 'admin.created@schoppmann.de', password: 'Created123', name: 'Erstellt Admin', role: 'mitarbeiter' }
    });
    check('Admin User erstellt 201', createUser.status === 201 && !!createUser.json?.data?.user?.id, createUser.json);
    const createdUserId = createUser.json?.data?.user?.id;

    const getUser = await api('GET', `/api/admin/users/${createdUserId}`, { token: adminToken });
    check('Admin User abrufen 200', getUser.status === 200 && getUser.json?.data?.user?.id === createdUserId, getUser.status);

    const updUser = await api('PUT', `/api/admin/users/${createdUserId}`, { token: adminToken, body: { name: 'Geändert Name', isActive: false } });
    check('Admin User aktualisiert (inaktiv erlaubt)', updUser.status === 200 && updUser.json?.data?.user?.isActive === false, updUser.json);

    const updUserSettings = await api('PUT', `/api/admin/users/${createdUserId}/settings`, { token: adminToken, body: { stundenlohn: 15 } });
    check('Admin User-Settings 200', updUserSettings.status === 200 && updUserSettings.json?.data?.user, updUserSettings.json);

    const toggle = await api('PATCH', `/api/admin/users/${createdUserId}/toggle-status`, { token: adminToken });
    check('Admin Toggle-Status 200', toggle.status === 200 && toggle.json?.data?.user?.isActive === true, toggle.json);

    const selfDelete = await api('DELETE', `/api/admin/users/${adminLogin.json?.data?.user?.id}`, { token: adminToken });
    check('Admin Selbstlöschung 400', selfDelete.status === 400 && selfDelete.json?.code === 'CANNOT_DELETE_SELF', selfDelete.json);

    const userStats = await api('GET', '/api/admin/stats/users', { token: adminToken });
    check('Admin User-Stats 200', userStats.status === 200 && typeof userStats.json?.data?.total === 'number', userStats.status);

    const delUser = await api('DELETE', `/api/admin/users/${createdUserId}`, { token: adminToken });
    check('Admin User gelöscht 200', delUser.status === 200 && !!delUser.json?.data?.deletedUser, delUser.json);

    // ---- Minijob ----
    console.log('\n[Minijob]');
    const newSetting = await api('POST', '/api/admin/minijob/settings', {
      token: adminToken,
      body: { monthlyLimit: 538.0, description: 'Smoke Test Limit', validFrom: '2099-01-01', validUntil: null }
    });
    check('Minijob-Einstellung erstellt 201', newSetting.status === 201 && newSetting.json?.success === true, newSetting.json);
    const settingId = newSetting.json?.data?.setting?.id;

    const settings = await api('GET', '/api/admin/minijob/settings', { token: adminToken });
    check('Minijob-Liste 200', settings.status === 200 && Array.isArray(settings.json?.data?.settings), settings.status);

    const updateSetting = await api('PUT', `/api/admin/minijob/settings/${settingId}`, {
      token: adminToken,
      body: { monthlyLimit: 600.0, description: 'Smoke aktualisiert', validFrom: '2099-01-01', validUntil: null }
    });
    check('Minijob aktualisiert 200', updateSetting.status === 200 && updateSetting.json?.data?.setting, updateSetting.json);

    const missingSetting = await api('PUT', '/api/admin/minijob/settings/999999', {
      token: adminToken,
      body: { monthlyLimit: 600.0, description: 'Existiert nicht', validFrom: '2099-01-01', validUntil: null }
    });
    check('Minijob unbekannt 404 SETTING_NOT_FOUND', missingSetting.status === 404 && missingSetting.json?.code === 'SETTING_NOT_FOUND', missingSetting.json);

    const stats = await api('GET', '/api/admin/minijob/stats', { token: adminToken });
    check('Minijob-Stats 200', stats.status === 200 && !!stats.json?.data?.overview, stats.status);

    const recalc = await api('POST', '/api/admin/minijob/settings/recalculate-periods', { token: adminToken });
    check('Minijob Neuberechnung 200', recalc.status === 200 && typeof recalc.json?.data?.adjustedCount === 'number', recalc.json);

    const refresh = await api('POST', '/api/admin/minijob/settings/refresh-status', { token: adminToken });
    check('Minijob Refresh-Status 200', refresh.status === 200 && refresh.json?.success === true, refresh.status);

    const delSetting = await api('DELETE', `/api/admin/minijob/settings/${settingId}`, { token: adminToken });
    check('Minijob gelöscht 200', delSetting.status === 200 && delSetting.json?.data?.deletedSetting?.id === settingId, delSetting.json);

    // ---- Monatsabschluss & Änderungsprotokoll ----
    console.log('\n[Monatsabschluss & Protokoll]');
    const empId = login.json?.data?.user?.id;
    const [ty, tm] = today().split('-').map(Number);
    const py = tm === 1 ? ty - 1 : ty;
    const pm = tm === 1 ? 12 : tm - 1;
    const prevMonth = `${py}-${String(pm).padStart(2, '0')}`;
    const currentMonthParam = today().slice(0, 7);
    const pastEntry = await TimeEntry.create({
      userId: empId, date: `${prevMonth}-01`, startTime: '09:00:00', endTime: '17:00:00', breakMinutes: 0, hourlyRateCents: 1200
    });

    const auditForbidden = await api('GET', '/api/admin/audit', { token: empToken });
    check('Protokoll: Mitarbeiter abgewiesen 403', auditForbidden.status === 403, auditForbidden.status);
    const audit = await api('GET', '/api/admin/audit?action=time_entry', { token: adminToken });
    check(
      'Protokoll: Admin sieht Zeiteintrag-Änderungen',
      audit.status === 200 && audit.json?.data?.entries?.some((e) => e.action === 'time_entry.create' && e.actorEmail === empCreds.email),
      audit.json
    );

    const sheetForbidden = await api('GET', `/api/admin/timesheets/${empId}?month=${prevMonth}`, { token: empToken });
    check('Zeitnachweis: Mitarbeiter abgewiesen 403', sheetForbidden.status === 403, sheetForbidden.status);
    const sheet = await api('GET', `/api/admin/timesheets/${empId}?month=${prevMonth}`, { token: adminToken });
    check('Zeitnachweis: Admin sieht Mitarbeiter-Periode', sheet.status === 200 && sheet.json?.data?.records?.length === 1 && sheet.json.data.period.status === 'open', sheet.json);

    const closeRunning = await api('POST', `/api/admin/timesheets/${empId}/close`, { token: adminToken, body: { month: currentMonthParam } });
    check('Abschluss laufender Periode 409 PERIOD_NOT_ENDED', closeRunning.status === 409 && closeRunning.json?.code === 'PERIOD_NOT_ENDED', closeRunning.json);

    const closed = await api('POST', `/api/admin/timesheets/${empId}/close`, { token: adminToken, body: { month: prevMonth } });
    check('Periode abgeschlossen 201', closed.status === 201 && closed.json?.data?.closure?.earningsCents === 9600, closed.json);

    const editClosed = await api('PUT', `/api/timetracking/${pastEntry.id}`, { token: empToken, body: { startTime: '09:00', endTime: '16:00', breakMinutes: 0 } });
    check('Bearbeiten in geschlossener Periode 409 PERIOD_CLOSED', editClosed.status === 409 && editClosed.json?.code === 'PERIOD_CLOSED', editClosed.json);
    const deleteClosed = await api('DELETE', `/api/timetracking/${pastEntry.id}`, { token: empToken });
    check('Löschen in geschlossener Periode 409 PERIOD_CLOSED', deleteClosed.status === 409 && deleteClosed.json?.code === 'PERIOD_CLOSED', deleteClosed.json);
    const empMonthClosed = await api('GET', `/api/timetracking?month=${prevMonth}`, { token: empToken });
    check('Mitarbeiter sieht Status "closed"', empMonthClosed.json?.data?.period?.status === 'closed', empMonthClosed.json?.data?.period);

    const noReason = await api('POST', `/api/admin/timesheets/${empId}/reopen`, { token: adminToken, body: { month: prevMonth } });
    check('Wiedereröffnen ohne Begründung 400', noReason.status === 400, noReason.json);
    const reopened = await api('POST', `/api/admin/timesheets/${empId}/reopen`, { token: adminToken, body: { month: prevMonth, reason: 'Smoke-Test: Korrektur' } });
    check('Wiedereröffnen mit Begründung 200', reopened.status === 200, reopened.json);
    const editOpen = await api('PUT', `/api/timetracking/${pastEntry.id}`, { token: empToken, body: { startTime: '09:00', endTime: '16:00', breakMinutes: 0 } });
    check('Bearbeiten nach Wiedereröffnung 200', editOpen.status === 200, editOpen.json);

    // ---- Cookie-Anmeldung & Sitzungen ----
    console.log('\n[Cookie-Anmeldung & Sitzungen]');
    const authUser = { email: 'smoke.session@schoppmann.de', password: 'Session123', name: 'Session Tester' };
    const createdAuthUser = await api('POST', '/api/admin/users', { token: adminToken, body: { ...authUser, role: 'mitarbeiter' } });
    const authUserId = createdAuthUser.json?.data?.user?.id;
    const loginAs = async (session, password = authUser.password) =>
      api('POST', '/api/auth/login', { session, body: { email: authUser.email, password } });
    const profileOf = (session) => api('GET', '/api/auth/profile', { token: session });

    const s1 = newSession();
    const l1 = await loginAs(s1);
    const cookieLine = (name) => l1.setCookies.find((c) => c.startsWith(`${name}=`)) || '';
    check(
      'Login: Tokens stehen nicht im Antwort-Body',
      l1.status === 200 && !JSON.stringify(l1.json).includes('eyJ') && l1.json?.data?.accessToken === undefined && l1.json?.data?.refreshToken === undefined,
      l1.json
    );
    check(
      'Login-Cookies sind httpOnly und SameSite=Strict',
      ['zeit_access', 'zeit_refresh'].every((n) => /httponly/i.test(cookieLine(n)) && /samesite=strict/i.test(cookieLine(n))),
      l1.setCookies
    );
    check(
      'Cookie-Pfade eingeschränkt (/api bzw. /api/auth), Zugriffs-Token 15 Minuten',
      /path=\/api(;|$)/i.test(cookieLine('zeit_access')) && /path=\/api\/auth/i.test(cookieLine('zeit_refresh')) && /max-age=900/i.test(cookieLine('zeit_access')),
      l1.setCookies
    );

    const noCsrf = await api('POST', '/api/auth/login', { csrf: false, body: { email: authUser.email, password: authUser.password } });
    check('Ändernde Anfrage ohne CSRF-Header 403 CSRF_HEADER_MISSING', noCsrf.status === 403 && noCsrf.json?.code === 'CSRF_HEADER_MISSING', noCsrf.json);

    check('Profil mit Cookie 200', (await profileOf(s1)).status === 200);
    const noCookie = await api('GET', '/api/auth/profile');
    check('Ohne Cookie 401 MISSING_TOKEN', noCookie.status === 401 && noCookie.json?.code === 'MISSING_TOKEN', noCookie.json);
    const forged = newSession();
    forged.jar.set('zeit_access', 'eyJhbGciOiJIUzI1NiJ9.e30.gefaelscht');
    const forgedRes = await api('GET', '/api/auth/profile', { token: forged });
    check('Gefälschtes Token 401 INVALID_TOKEN', forgedRes.status === 401 && forgedRes.json?.code === 'INVALID_TOKEN', forgedRes.json);
    const bearer = await api('GET', '/api/auth/profile', { headers: { Authorization: `Bearer ${s1.jar.get('zeit_access')}` } });
    check('Bearer-Header wird nicht mehr akzeptiert (401)', bearer.status === 401 && bearer.json?.code === 'MISSING_TOKEN', bearer.json);

    // Erneuerung rotiert das Erneuerungs-Token
    const oldRefresh = s1.jar.get('zeit_refresh');
    const r1 = await api('POST', '/api/auth/refresh', { token: s1 });
    check(
      'Erneuerung 200: neues Erneuerungs-Token, keine Tokens im Body',
      r1.status === 200 && s1.jar.get('zeit_refresh') !== oldRefresh && !JSON.stringify(r1.json).includes('refreshToken'),
      r1.json
    );
    const raceSession = newSession();
    raceSession.jar.set('zeit_refresh', oldRefresh);
    const race = await api('POST', '/api/auth/refresh', { token: raceSession });
    check('Altes Token direkt nach Rotation (zwei Tabs) 409 REFRESH_IN_PROGRESS', race.status === 409 && race.json?.code === 'REFRESH_IN_PROGRESS', race.json);
    check('… Sitzung bleibt gültig (keine Sperre)', (await profileOf(s1)).status === 200);

    // Wiederverwendung nach der Schonfrist = Diebstahlverdacht → Sitzung wird beendet
    config.auth.refreshGraceSeconds = 0;
    await new Promise((resolve) => setTimeout(resolve, 30));
    const reuse = await api('POST', '/api/auth/refresh', { token: raceSession });
    config.auth.refreshGraceSeconds = 10;
    check('Wiederverwendetes Token 401 REFRESH_TOKEN_REUSED', reuse.status === 401 && reuse.json?.code === 'REFRESH_TOKEN_REUSED', reuse.json);
    const afterReuse = await profileOf(s1);
    check('… ganze Sitzung beendet (Zugriff 401 SESSION_ENDED)', afterReuse.status === 401 && afterReuse.json?.code === 'SESSION_ENDED', afterReuse.json);
    check('… auch das neueste Erneuerungs-Token ist ungültig', (await api('POST', '/api/auth/refresh', { token: s1 })).status === 401);

    // Abmelden wirkt sofort und serverseitig
    const s2 = newSession();
    await loginAs(s2);
    const accessBeforeLogout = s2.jar.get('zeit_access');
    const out = await api('POST', '/api/auth/logout', { token: s2 });
    check('Logout 200, Cookies gelöscht', out.status === 200 && !s2.jar.has('zeit_access') && !s2.jar.has('zeit_refresh'), out.setCookies);
    const replay = newSession();
    replay.jar.set('zeit_access', accessBeforeLogout);
    const replayRes = await profileOf(replay);
    check('Zugriffs-Token nach Logout sofort ungültig (401 SESSION_ENDED)', replayRes.status === 401 && replayRes.json?.code === 'SESSION_ENDED', replayRes.json);

    // Logout fremder Sitzungen ist nicht möglich
    const s3 = newSession();
    await loginAs(s3);
    const foreign = newSession();
    foreign.jar.set('zeit_refresh', `${s3.jar.get('zeit_refresh').split('.')[0]}.falschesGeheimnis`);
    await api('POST', '/api/auth/logout', { token: foreign });
    check('Logout mit falschem Geheimnis beendet die fremde Sitzung nicht', (await profileOf(s3)).status === 200);

    // Passwortwechsel beendet die anderen Sitzungen
    const sa = newSession();
    const sb = newSession();
    await loginAs(sa);
    await loginAs(sb);
    const changed = await api('PUT', '/api/auth/change-password', { token: sa, body: { currentPassword: authUser.password, newPassword: 'Neu12345x' } });
    authUser.password = 'Neu12345x';
    check('Passwortwechsel 200', changed.status === 200, changed.json);
    check('… eigene Sitzung bleibt bestehen', (await profileOf(sa)).status === 200);
    const otherAfterChange = await profileOf(sb);
    check('… andere Sitzung sofort beendet (SESSION_ENDED)', otherAfterChange.status === 401 && otherAfterChange.json?.code === 'SESSION_ENDED', otherAfterChange.json);

    // Sperren wirkt sofort
    const sc = newSession();
    await loginAs(sc);
    await api('PATCH', `/api/admin/users/${authUserId}/toggle-status`, { token: adminToken });
    const blocked = await profileOf(sc);
    check('Gesperrtes Konto: bestehender Zugriff sofort 401', blocked.status === 401, blocked.json);
    const blockedLogin = await loginAs(newSession());
    check('Gesperrtes Konto: Login 403 USER_INACTIVE', blockedLogin.status === 403 && blockedLogin.json?.code === 'USER_INACTIVE', blockedLogin.json);

    // Protokoll der Anmelde-Ereignisse
    const wrongLogin = await loginAs(newSession(), 'FalschesPasswort1');
    check('Falsches Passwort 401', wrongLogin.status === 401, wrongLogin.json);
    const authAudit = await api('GET', `/api/admin/audit?action=auth&userId=${authUserId}&limit=100`, { token: adminToken });
    const authActions = (authAudit.json?.data?.entries || []).map((e) => e.action);
    check(
      'Protokoll: Anmeldung, Abmeldung, Fehlversuch, Wiederverwendung',
      ['auth.login', 'auth.logout', 'auth.login_failed', 'auth.session_reuse_detected'].every((a) => authActions.includes(a)),
      authActions
    );
    const withoutAuth = await api('GET', '/api/admin/audit?exclude=auth&limit=200', { token: adminToken });
    check('Protokoll: exclude=auth blendet Anmelde-Ereignisse aus', (withoutAuth.json?.data?.entries || []).every((e) => !e.action.startsWith('auth.')) && withoutAuth.json.data.entries.length > 0, withoutAuth.json?.data?.entries?.length);

    // ---- Sicherungsstatus ----
    const backupForbidden = await api('GET', '/api/admin/system/backup', { token: empToken });
    check('Sicherungsstatus: Mitarbeiter abgewiesen 403', backupForbidden.status === 403, backupForbidden.status);
    const backupStatus = await api('GET', '/api/admin/system/backup', { token: adminToken });
    check(
      'Sicherungsstatus: Admin erhält Bewertung',
      backupStatus.status === 200 && ['ok', 'warning', 'error', 'unknown'].includes(backupStatus.json?.data?.state) && typeof backupStatus.json.data.message === 'string',
      backupStatus.json
    );

    const periodAudit = await api('GET', `/api/admin/audit?userId=${empId}&action=period`, { token: adminToken });
    check(
      'Protokoll enthält Abschluss und Wiedereröffnung mit Begründung',
      periodAudit.json?.data?.entries?.some((e) => e.action === 'period.close') &&
        periodAudit.json.data.entries.some((e) => e.action === 'period.reopen' && e.meta?.reason === 'Smoke-Test: Korrektur'),
      periodAudit.json
    );
  } finally {
    server.close();
    await sequelize.close();
    try { fs.unlinkSync(dbFile); } catch { /* ignore */ }
  }

  console.log(`\n──────────────────────────────`);
  console.log(`Smoke-Test: ${passed} grün, ${failed} rot`);
  console.log(`──────────────────────────────`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('💥 Smoke-Test abgebrochen:', err);
  process.exit(1);
});
