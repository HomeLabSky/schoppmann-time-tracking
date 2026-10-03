/**
 * Umgebung für den Smoke-Test – wird vor allen anderen Modulen geladen (erster Import in test/smoke.ts),
 * weil die Konfiguration beim Laden gelesen wird.
 */
import os from 'node:os';
import path from 'node:path';

// Test-Umgebung VOR dem Laden von config/app setzen.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
export const dbFile = path.join(os.tmpdir(), `schoppmann-smoke-${Date.now()}.sqlite`);
process.env.DB_STORAGE = dbFile;
process.env.DB_LOGGING = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke_test_jwt_secret_min_32_chars_long_value';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smoke_test_refresh_secret_min_32_chars_long_value';
// Selbstregistrierung ist produktiv standardmäßig aus; der Test schaltet sie gezielt ein.
process.env.ALLOW_REGISTRATION = 'true';
// Der Test meldet sich oft an: Rate-Limits (pro IP) hochsetzen
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
process.env.RATE_LIMIT_MAX_REQUESTS = '10000';
// Jede Antwort gegen ihr dokumentiertes Schema prüfen (OpenAPI = Wirklichkeit)
process.env.VALIDATE_RESPONSES = '1';


