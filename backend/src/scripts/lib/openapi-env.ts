/**
 * Umgebung für `npm run openapi`: Die App wird nur aufgebaut, um die Routen zu registrieren; es wird keine
 * Datenbank geöffnet und kein Geheimnis verwendet. Muss vor der App geladen werden (erster Import).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'openapi_generation_only_secret_32_chars_min';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'openapi_generation_only_refresh_32_chars_min';

export {};
