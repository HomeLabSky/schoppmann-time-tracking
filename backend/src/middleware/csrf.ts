/**
 * CSRF-Schutz für die Cookie-Anmeldung (Web).
 *
 * Ändernde Anfragen (POST/PUT/PATCH/DELETE) müssen den Header `X-CSRF-Protection: 1` enthalten. Eine fremde
 * Webseite kann diesen Header nicht setzen (Browser verlangen dafür eine CORS-Freigabe, die nur die eigene
 * Oberfläche bekommt). Zusätzlich sind die Cookies `SameSite=Strict` und das Backend verlangt JSON als Content-Type.
 *
 * Ausgenommen (kein Cookie im Spiel, daher kein CSRF möglich):
 *   - Anfragen mit `Authorization`-Header (App): den Header kann eine fremde Seite ebenfalls nicht setzen,
 *     und die Anmeldung erfolgt dann ausschließlich über ihn (middleware/auth.ts).
 *   - Token-Anmeldung der App (`/auth/token…`): Zugangsdaten bzw. Erneuerungs-Token stehen im Body.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_ENDPOINTS = /^\/auth\/token(\/(refresh|revoke))?\/?$/;

export const requireCsrfHeader = (req: Request, _res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('authorization') !== undefined) return next();
  if (TOKEN_ENDPOINTS.test(req.path)) return next();
  if (req.get('X-CSRF-Protection') !== '1') {
    return next(new AppError('CSRF_HEADER_MISSING', 'Anfrage abgelehnt (fehlender Sicherheits-Header)'));
  }
  next();
};


