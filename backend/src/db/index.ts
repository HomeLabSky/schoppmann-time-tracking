/**
 * Datenbank initialisieren: Verbindung öffnen, Migrationen anwenden, Minijob-Aktivkennzeichen aktualisieren.
 * Wird von server.ts, Tests und CLI-Skripten einmal beim Start aufgerufen.
 */
import logger from '../lib/logger';
import { MinijobService } from '../services/minijobService';
import { closeDb, getDb } from './client';
import { runMigrations } from './migrate';

export const initDatabase = async (): Promise<void> => {
  getDb();
  runMigrations();
  MinijobService.updateActiveStatusSync();
  logger.info('Datenbank initialisiert');
};

export { closeDb, getDb };
