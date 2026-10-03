/**
 * Ordner des Backends (enthält package.json, .env, drizzle/, database/).
 *
 * Gleich, ob der Code als TypeScript aus src/ (Entwicklung, Tests) oder kompiliert aus dist/ läuft und aus welchem
 * Verzeichnis er gestartet wurde – relative Pfade aus der Konfiguration beziehen sich immer auf diesen Ordner.
 */
import fs from 'node:fs';
import path from 'node:path';

const findBackendRoot = (start: string): string => {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'drizzle'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Backend-Ordner (mit package.json und drizzle/) oberhalb von ${start} nicht gefunden`);
    dir = parent;
  }
};

export const BACKEND_ROOT = findBackendRoot(__dirname);

/** Pfad relativ zum Backend-Ordner auflösen (absolute Pfade bleiben unverändert). */
export const fromBackendRoot = (...segments: string[]): string => path.resolve(BACKEND_ROOT, ...segments);
