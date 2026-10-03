/**
 * Anmelde-Cookies (nur Web; die App bekommt ihre Tokens im Body, siehe POST /auth/token).
 *
 * Beide Cookies sind httpOnly (für JavaScript unsichtbar – ein Skript-Angriff kann sie nicht auslesen),
 * SameSite=Strict (werden bei Anfragen von fremden Seiten nicht mitgeschickt) und in Produktion Secure.
 *  - Zugriffs-Token:      für /api (gilt für /api und /api/v1), 15 Minuten
 *  - Erneuerungs-Token:   nur für den Auth-Pfad, über den angemeldet wurde (/api/auth bzw. /api/v1/auth),
 *                         gleitend 7 Tage
 */
const cookie = require('cookie');
const config = require('../config');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCESS_PATH = '/api';
const REFRESH_PATHS = ['/api/auth', '/api/v1/auth'];
const REFRESH_PATH = REFRESH_PATHS[0];

const base = () => ({ httpOnly: true, secure: config.auth.cookieSecure, sameSite: 'strict' });

/**
 * @param {import('express').Response} res
 * @param {{accessToken:string, refreshToken:string}} tokens
 * @param {string} [refreshPath] Auth-Pfad der Anfrage (req.baseUrl), damit die Erneuerung dort das Cookie bekommt
 */
const setAuthCookies = (res, { accessToken, refreshToken }, refreshPath = REFRESH_PATH) => {
  res.cookie(config.auth.accessCookie, accessToken, {
    ...base(),
    path: ACCESS_PATH,
    maxAge: config.auth.accessTtlSeconds * 1000
  });
  res.cookie(config.auth.refreshCookie, refreshToken, {
    ...base(),
    path: REFRESH_PATHS.includes(refreshPath) ? refreshPath : REFRESH_PATH,
    maxAge: config.auth.refreshTtlDays * DAY_MS
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie(config.auth.accessCookie, { ...base(), path: ACCESS_PATH });
  for (const path of REFRESH_PATHS) {
    res.clearCookie(config.auth.refreshCookie, { ...base(), path });
  }
};

const readCookies = (req) => cookie.parse(req.headers.cookie || '');

module.exports = { setAuthCookies, clearAuthCookies, readCookies, ACCESS_PATH, REFRESH_PATH, REFRESH_PATHS };
