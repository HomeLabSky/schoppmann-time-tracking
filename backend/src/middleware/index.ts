/**
 * Middleware-Barrel: Kombinationen für app.ts und routes/index.ts.
 *
 * Die Berechtigung steht an jeder einzelnen Route (lib/route.ts, Feld `auth`) und damit auch im
 * OpenAPI-Dokument. Die Einhängepunkte prüfen zusätzlich (doppelt hält besser: eine neue Route unter
 * /admin ohne `auth: 'admin'` ist trotzdem geschützt). Die Prüfung läuft je Anfrage nur einmal.
 */
import * as authMiddleware from './auth';
import * as rateLimitingMiddleware from './rateLimiting';
import * as securityMiddleware from './security';

// Basis-Security-Stack (für app.ts)
const basicSecurity = [
  securityMiddleware.helmetMiddleware,
  securityMiddleware.corsMiddleware,
  securityMiddleware.securityHeaders
];

// Angemeldete Benutzer
const authenticatedAPI = [
  rateLimitingMiddleware.apiLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.authenticateToken
];

// Nur Admins
const adminAPI = [
  rateLimitingMiddleware.adminLimiter,
  securityMiddleware.validateContentType,
  authMiddleware.requireAdmin
];

export const generalLimiter = rateLimitingMiddleware.generalLimiter;

export { basicSecurity, authenticatedAPI, adminAPI };
