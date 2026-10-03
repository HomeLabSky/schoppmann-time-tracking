/**
 * Schreibt den API-Vertrag nach backend/openapi.json (für App- und Web-Client-Generatoren).
 *
 * Aufruf:  npm run openapi
 * Ein Unit-Test prüft, dass die Datei zum Code passt – nach Änderungen an Routen oder Schemas neu erzeugen.
 */
const fs = require('fs');
const path = require('path');

// Nur für den Aufbau der Routen; es wird keine Datenbank geöffnet
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'openapi_generation_only_secret_32_chars_min';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'openapi_generation_only_refresh_32_chars_min';

require('../app');
const { buildOpenApiDocument } = require('../lib/openapi');
const { API_VERSION } = require('../routes');

const file = path.join(__dirname, '..', 'openapi.json');
fs.writeFileSync(file, JSON.stringify(buildOpenApiDocument({ version: API_VERSION }), null, 2) + '\n');
console.log(`OpenAPI-Dokument geschrieben: ${path.relative(process.cwd(), file)}`);
