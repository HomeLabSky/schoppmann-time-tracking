const config = require('../config');
const SessionService = require('../services/sessionService');
const { readCookies } = require('../utils/authCookies');
const { AppError } = require('../lib/errors');
const logger = require('../lib/logger');

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

/** Zugriffs-Token und Herkunft aus der Anfrage */
const readAccessToken = (req) => {
  const header = req.get('authorization');
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    return { token: match ? match[1] : null, via: 'bearer' };
  }
  return { token: readCookies(req)[config.auth.accessCookie] || null, via: 'cookie' };
};

/** Setzt `req.user` (einmal je Anfrage). */
const authenticate = async (req) => {
  if (req.user && req.user.sid) return;

  const { token, via } = readAccessToken(req);
  if (!token) throw new AppError('MISSING_TOKEN', 'Nicht angemeldet');

  const { user, sid } = await SessionService.authenticate(token);
  req.user = { userId: user.id, email: user.email, role: user.role, name: user.name, sid, via };
  req.log = req.log && req.log.child({ userId: user.id });
};

const authenticateToken = async (req, res, next) => {
  await authenticate(req);
  next();
};

const requireRole = (allowedRoles, message) => async (req, res, next) => {
  await authenticate(req);
  if (!allowedRoles.includes(req.user.role)) {
    (req.log || logger).warn({ userId: req.user.userId, role: req.user.role, method: req.method, path: req.path }, 'Zugriff verweigert');
    throw new AppError('INSUFFICIENT_PERMISSIONS', message);
  }
  next();
};

// Admin-only
const requireAdmin = requireRole(['admin'], 'Administratorrechte erforderlich');
// Mitarbeiter oder Admin
const requireEmployee = requireRole(['mitarbeiter', 'admin'], 'Mitarbeiter-Rechte erforderlich');

/** Auslöser für das Änderungsprotokoll */
const actorOf = (req) => ({ id: req.user.userId, email: req.user.email });

module.exports = {
  authenticateToken,
  requireAdmin,
  requireEmployee,
  readAccessToken,
  actorOf
};
