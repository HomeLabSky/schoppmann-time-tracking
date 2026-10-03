/**
 * Authentifizierung – zwei gleichwertige Wege auf derselben Sitzungs-Tabelle:
 *   - Web: httpOnly-Cookie `zeit_access`
 *   - App: Header `Authorization: Bearer <Zugriffs-Token>`
 * Ist ein Authorization-Header vorhanden, gilt ausschließlich er (kein Rückfall auf Cookies).
 *
 * Bei jeder Anfrage wird gegen die Datenbank geprüft, ob die Sitzung noch gültig und der Benutzer aktiv ist.
 * Rolle, Name und E-Mail stammen aus der Datenbank, nicht aus dem Token: Abmelden, Sperren und
 * Rollenänderungen wirken sofort.
 *
 * Fehler (immer 401, fehlende Berechtigung = 403):
 *   MISSING_TOKEN / TOKEN_EXPIRED → Client erneuert still die Sitzung
 *   INVALID_TOKEN / SESSION_ENDED / USER_INACTIVE → erneute Anmeldung nötig
 */
import type { NextFunction, Request, Response } from 'express';
import config from '../config';
import type { Role } from '../db/schema';
import { AppError } from '../lib/errors';
import logger from '../lib/logger';
import type { Actor } from '../services/auditService';
import { SessionService } from '../services/sessionService';
import { readCookies } from '../utils/authCookies';

/** Angemeldeter Benutzer der Anfrage (aus der Datenbank, nicht aus dem Token) */
export interface AuthUser {
  userId: number;
  email: string;
  role: Role;
  name: string;
  sid: string;
  via: 'bearer' | 'cookie';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Zugriffs-Token und Herkunft aus der Anfrage */
export const readAccessToken = (req: Request): { token: string | null; via: 'bearer' | 'cookie' } => {
  const header = req.get('authorization');
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    return { token: match?.[1] ?? null, via: 'bearer' };
  }
  return { token: readCookies(req)[config.auth.accessCookie] || null, via: 'cookie' };
};

/** Setzt `req.user` (einmal je Anfrage). */
const authenticate = async (req: Request): Promise<AuthUser> => {
  if (req.user?.sid) return req.user;

  const { token, via } = readAccessToken(req);
  if (!token) throw new AppError('MISSING_TOKEN', 'Nicht angemeldet');

  const { user, sid } = await SessionService.authenticate(token);
  req.user = { userId: user.id, email: user.email, role: user.role, name: user.name, sid, via };
  return req.user;
};

export const authenticateToken = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  await authenticate(req);
  next();
};

const requireRole = (allowedRoles: Role[], message: string) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = await authenticate(req);
    if (!allowedRoles.includes(user.role)) {
      (req.log || logger).warn({ userId: user.userId, role: user.role, method: req.method, path: req.path }, 'Zugriff verweigert');
      throw new AppError('INSUFFICIENT_PERMISSIONS', message);
    }
    next();
  };

// Admin-only
export const requireAdmin = requireRole(['admin'], 'Administratorrechte erforderlich');
// Mitarbeiter oder Admin
export const requireEmployee = requireRole(['mitarbeiter', 'admin'], 'Mitarbeiter-Rechte erforderlich');

/** Auslöser für das Änderungsprotokoll */
export const actorOf = (req: { user?: AuthUser | undefined }): Actor =>
  req.user ? { id: req.user.userId, email: req.user.email } : null;
