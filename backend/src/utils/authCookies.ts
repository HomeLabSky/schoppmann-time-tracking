/**
 * Anmelde-Cookies (nur Web; die App bekommt ihre Tokens im Body, siehe POST /auth/token).
 *
 * Beide Cookies sind httpOnly (für JavaScript unsichtbar – ein Skript-Angriff kann sie nicht auslesen),
 * SameSite=Strict (werden bei Anfragen von fremden Seiten nicht mitgeschickt) und in Produktion Secure.
 *  - Zugriffs-Token:      für /api (gilt für /api und /api/v1), 15 Minuten
 *  - Erneuerungs-Token:   nur für den Auth-Pfad, über den angemeldet wurde (/api/auth bzw. /api/v1/auth),
 *                         gleitend 7 Tage
 */
import * as cookie from 'cookie';
import type { CookieOptions, Request, Response } from 'express';
import config from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACCESS_PATH = '/api';
export const REFRESH_PATHS = ['/api/auth', '/api/v1/auth'] as const;
export const REFRESH_PATH = REFRESH_PATHS[0];

const base = (): CookieOptions => ({ httpOnly: true, secure: config.auth.cookieSecure, sameSite: 'strict' });

/**
 * @param refreshPath Auth-Pfad der Anfrage (req.baseUrl), damit die Erneuerung dort das Cookie bekommt
 */
export const setAuthCookies = (
  res: Response,
  { accessToken, refreshToken }: { accessToken: string; refreshToken: string },
  refreshPath: string = REFRESH_PATH
): void => {
  res.cookie(config.auth.accessCookie, accessToken, {
    ...base(),
    path: ACCESS_PATH,
    maxAge: config.auth.accessTtlSeconds * 1000
  });
  res.cookie(config.auth.refreshCookie, refreshToken, {
    ...base(),
    path: (REFRESH_PATHS as readonly string[]).includes(refreshPath) ? refreshPath : REFRESH_PATH,
    maxAge: config.auth.refreshTtlDays * DAY_MS
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(config.auth.accessCookie, { ...base(), path: ACCESS_PATH });
  for (const path of REFRESH_PATHS) {
    res.clearCookie(config.auth.refreshCookie, { ...base(), path });
  }
};

export const readCookies = (req: Request): Record<string, string | undefined> => cookie.parse(req.headers.cookie || '');

