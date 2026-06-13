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

const app = require('../app');
const { initDatabase, sequelize } = require('../models');

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

  const api = async (method, endpoint, { token, body } = {}) => {
    const res = await fetch(base + endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    let json = null;
    try { json = await res.json(); } catch { /* leerer Body */ }
    return { status: res.status, json };
  };

  try {
    // ---- Infra ----
    console.log('\n[Infrastruktur]');
    const health = await api('GET', '/health');
    check('GET /health 200', health.status === 200, health.status);
    const apiInfo = await api('GET', '/api/');
    check('GET /api/ liefert version', apiInfo.json && apiInfo.json.version === '2.0.0', apiInfo.json);

    // ---- Setup: erster Admin ----
    console.log('\n[Setup]');
    const firstAdmin = await api('GET', '/api/setup/create-first-admin');
    check('Setup erster Admin erstellt', firstAdmin.json && firstAdmin.json.success === true, firstAdmin.json);

    // ---- Auth: Mitarbeiter registrieren + login ----
    console.log('\n[Auth]');
    const empCreds = { email: 'smoke.employee@schoppmann.de', password: 'Test1234', name: 'Smoke Tester' };
    const register = await api('POST', '/api/auth/register', { body: empCreds });
    check('Registrierung 201 + Tokens', register.status === 201 && !!register.json?.data?.accessToken, register.json);

    const login = await api('POST', '/api/auth/login', { body: { email: empCreds.email, password: empCreds.password } });
    check('Login 200 + Tokens', login.status === 200 && !!login.json?.data?.accessToken, login.status);
    check('Login liefert user ohne Passwort', login.json?.data?.user && login.json.data.user.password === undefined, login.json?.data?.user);
    const empToken = login.json?.data?.accessToken;

    const noToken = await api('GET', '/api/auth/profile');
    check('Profil ohne Token abgewiesen (401/403)', noToken.status === 401 || noToken.status === 403, noToken.status);

    const profile = await api('GET', '/api/auth/profile', { token: empToken });
    check('Profil mit Token 200', profile.status === 200 && profile.json?.data?.user?.email === empCreds.email, profile.json);

    // Fehlerpfade (Vertrag: Status + code)
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
    const adminLogin = await api('POST', '/api/auth/login', { body: { email: 'admin@schoppmann.de', password: 'Admin123!' } });
    check('Admin-Login 200', adminLogin.status === 200 && adminLogin.json?.data?.user?.role === 'admin', adminLogin.json?.data?.user);
    const adminToken = adminLogin.json?.data?.accessToken;

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
