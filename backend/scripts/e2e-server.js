/**
 * Test-Backend für die Ende-zu-Ende-Tests des Frontends (frontend/e2e, Playwright).
 *
 * Startet die echte API gegen eine frische, temporäre SQLite-Datei mit festen Testdaten:
 *   - Admin      e2e.admin@schoppmann.test
 *   - Mitarbeiter e2e.mitarbeiter@schoppmann.test (13,50 €/Std., ein Eintrag im Vormonat)
 *   - Minijob-Grenze 603 € ab 01.01. des Vorjahres
 * Passwort für beide: E2E_PASSWORD (Standard siehe unten – nur für diese Wegwerf-Datenbank).
 *
 * Nie gegen echte Daten verwenden: Die Datenbank wird bei jedem Start neu angelegt.
 */
const path = require('path');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.DB_STORAGE = path.join(os.tmpdir(), `schoppmann-e2e-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_test_jwt_secret_with_at_least_32_characters';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e_test_refresh_secret_with_at_least_32_chars';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
process.env.COOKIE_SECURE = 'false';
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';

const PORT = Number(process.env.PORT || 5000);
const PASSWORD = process.env.E2E_PASSWORD || 'E2eTest1234';

const app = require('../app');
const { initDatabase, User, TimeEntry, MinijobSetting } = require('../models');
const { todayString } = require('../utils/clock');

const firstOfPreviousMonth = () => {
  const [y, m] = todayString().split('-').map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
};

(async () => {
  await initDatabase();
  const admin = await User.create({ email: 'e2e.admin@schoppmann.test', name: 'Erika Admin', password: PASSWORD, role: 'admin' });
  const employee = await User.create({
    email: 'e2e.mitarbeiter@schoppmann.test',
    name: 'Emil Mitarbeiter',
    password: PASSWORD,
    role: 'mitarbeiter',
    stundenlohn: 13.5
  });
  const lastYear = Number(todayString().slice(0, 4)) - 1;
  await MinijobSetting.create({ monthlyLimit: 603, description: 'E2E Grenze', validFrom: `${lastYear}-01-01`, createdBy: admin.id });
  // Direkt im Model (ohne Zeitfenster-Regel), damit der Vormonat abgeschlossen werden kann
  await TimeEntry.create({
    userId: employee.id,
    date: firstOfPreviousMonth(),
    startTime: '09:00:00',
    endTime: '13:00:00',
    breakMinutes: 0,
    hourlyRateCents: 1350,
    description: 'E2E Vormonat'
  });

  app.locals.dbConnected = true;
  app.listen(PORT, () => console.log(`E2E-Backend auf http://localhost:${PORT} (DB: ${process.env.DB_STORAGE})`));
})().catch((error) => {
  console.error('E2E-Backend konnte nicht starten:', error);
  process.exit(1);
});
