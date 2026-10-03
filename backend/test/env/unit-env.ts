/**
 * Umgebung für Unit-/Integrationstests – als ERSTER Import jeder Testdatei, weil die Konfiguration beim Laden
 * gelesen wird. Jede Testdatei läuft in einem eigenen Prozess mit eigener, frischer SQLite-Datei.
 */
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DB_STORAGE = path.join(os.tmpdir(), `schoppmann-unit-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = 'unit_test_jwt_secret_with_at_least_32_chars';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_with_at_least_32_chars';

export const TEST_DB_FILE = process.env.DB_STORAGE;
