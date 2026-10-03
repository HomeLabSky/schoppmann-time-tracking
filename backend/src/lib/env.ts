/**
 * Lädt backend/.env (falls vorhanden) – unabhängig vom Startverzeichnis. Bereits gesetzte Umgebungsvariablen
 * haben Vorrang (Docker, Tests). Wird von config und logger als Erstes importiert.
 */
import dotenv from 'dotenv';
import { fromBackendRoot } from './paths';

dotenv.config({ path: fromBackendRoot('.env'), quiet: true });
