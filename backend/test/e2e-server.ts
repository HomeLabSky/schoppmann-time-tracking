/**
 * Test-Backend für die Ende-zu-Ende-Tests des Frontends (frontend/e2e, Playwright).
 *
 * Startet die echte API gegen eine frische, temporäre SQLite-Datei mit festen Testdaten:
 *   - Admin       e2e.admin@schoppmann.test
 *   - Mitarbeiter e2e.mitarbeiter@schoppmann.test (13,50 €/Std., ein Eintrag im Vormonat)
 *   - Minijob-Grenze 603 € ab 01.01. des Vorjahres
 * Passwort für beide: E2E_PASSWORD (Standard siehe unten – nur für diese Wegwerf-Datenbank).
 *
 * Aufruf: npm run e2e:server (Port über PORT). Nie gegen echte Daten verwenden: Die Datenbank wird bei jedem Start
 * neu angelegt.
 */
// Muss als Erstes geladen werden: setzt die Test-Umgebung, bevor die Konfiguration gelesen wird
import { dbFile } from './env/e2e-env';
import app from '../src/app';
import config from '../src/config';
import { initDatabase } from '../src/db';
import { db } from '../src/db/client';
import { minijobSettings, timeEntries, users } from '../src/db/schema';
import { hashPassword } from '../src/models/user';
import { MinijobService } from '../src/services/minijobService';
import { todayString } from '../src/utils/clock';

const PASSWORD = process.env.E2E_PASSWORD || 'E2eTest1234';

const firstOfPreviousMonth = (): string => {
  const [y = 0, m = 0] = todayString().split('-').map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
};

const main = async (): Promise<void> => {
  await initDatabase();
  const password = await hashPassword(PASSWORD);
  const admin = db().insert(users).values({
    email: 'e2e.admin@schoppmann.test', name: 'Erika Admin', password, role: 'admin'
  }).returning().get();
  const employee = db().insert(users).values({
    email: 'e2e.mitarbeiter@schoppmann.test', name: 'Emil Mitarbeiter', password, role: 'mitarbeiter', stundenlohn: 13.5
  }).returning().get();
  const lastYear = Number(todayString().slice(0, 4)) - 1;
  db().insert(minijobSettings).values({
    monthlyLimit: 603, description: 'E2E Grenze', validFrom: `${lastYear}-01-01`, createdBy: admin.id
  }).run();
  MinijobService.updateActiveStatusSync();
  // Direkt in der Tabelle (ohne Zeitfenster-Regel), damit der Vormonat abgeschlossen werden kann
  db().insert(timeEntries).values({
    userId: employee.id,
    date: firstOfPreviousMonth(),
    startTime: '09:00:00',
    endTime: '13:00:00',
    breakMinutes: 0,
    hourlyRateCents: 1350,
    description: 'E2E Vormonat'
  }).run();

  app.locals.dbConnected = true;
  app.listen(config.port, () => console.log(`E2E-Backend auf http://localhost:${config.port} (DB: ${dbFile})`));
};

main().catch((error: unknown) => {
  console.error('E2E-Backend konnte nicht starten:', error);
  process.exit(1);
});
