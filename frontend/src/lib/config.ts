/**
 * Zentrale Frontend-Konfiguration.
 *
 * `NEXT_PUBLIC_API_URL` wird beim Build fest eingebaut (siehe frontend/Dockerfile bzw.
 * frontend/.env.local). Ohne Angabe gilt die lokale Entwicklungsadresse.
 * Im Produktivbetrieb hinter Caddy ist das die öffentliche Adresse, z. B. https://zeit.firma.de
 * (das Backend ist dort unter /api erreichbar).
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
