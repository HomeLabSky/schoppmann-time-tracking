/**
 * Anmelde-Cookies.
 *
 * Beide Cookies sind httpOnly (für JavaScript unsichtbar – ein Skript-Angriff kann sie nicht auslesen),
 * SameSite=Strict (werden bei Anfragen von fremden Seiten nicht mitgeschickt) und in Produktion Secure.
 *  - Zugriffs-Token:      nur für /api, 15 Minuten
 *  - Erneuerungs-Token:   nur für /api/auth (Erneuerung, Abmeldung), gleitend 7 Tage
 */
const cookie = require('cookie');
const config = require('../config');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/auth';

const base = () => ({ httpOnly: true, secure: config.auth.cookieSecure, sameSite: 'strict' });

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  res.cookie(config.auth.accessCookie, accessToken, {
    ...base(),
    path: ACCESS_PATH,
    maxAge: config.auth.accessTtlSeconds * 1000
  });
  res.cookie(config.auth.refreshCookie, refreshToken, {
    ...base(),
    path: REFRESH_PATH,
    maxAge: config.auth.refreshTtlDays * DAY_MS
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie(config.auth.accessCookie, { ...base(), path: ACCESS_PATH });
  res.clearCookie(config.auth.refreshCookie, { ...base(), path: REFRESH_PATH });
};

const readCookies = (req) => cookie.parse(req.headers.cookie || '');

module.exports = { setAuthCookies, clearAuthCookies, readCookies, ACCESS_PATH, REFRESH_PATH };
