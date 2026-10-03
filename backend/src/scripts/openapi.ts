/**
 * Schreibt den API-Vertrag nach backend/openapi.json (für App- und Web-Client-Generatoren).
 *
 * Aufruf:  npm run openapi
 * Ein Unit-Test prüft, dass die Datei zum Code passt – nach Änderungen an Routen oder Schemas neu erzeugen.
 */
import './lib/openapi-env';
import fs from 'node:fs';
import path from 'node:path';
import '../app';
import { buildOpenApiDocument } from '../lib/openapi';
import { fromBackendRoot } from '../lib/paths';
import { API_VERSION } from '../routes';

const file = fromBackendRoot('openapi.json');
fs.writeFileSync(file, JSON.stringify(buildOpenApiDocument({ version: API_VERSION }), null, 2) + '\n');
console.log(`OpenAPI-Dokument geschrieben: ${path.relative(process.cwd(), file)}`);
