/**
 * Umgebung für das E2E-Test-Backend – wird vor allen anderen Modulen geladen (erster Import in test/e2e-server.ts),
 * weil die Konfiguration beim Laden gelesen wird.
 */
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
// Bei jedem Start eine frische Datei – nie gegen echte Daten
export const dbFile = path.join(os.tmpdir(), `schoppmann-e2e-${process.pid}-${Date.now()}.sqlite`);
process.env.DB_STORAGE = dbFile;
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_test_jwt_secret_with_at_least_32_characters';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e_test_refresh_secret_with_at_least_32_chars';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
process.env.COOKIE_SECURE = 'false';
// Die Browser-Tests melden sich oft an: Rate-Limits (pro IP) hochsetzen
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
