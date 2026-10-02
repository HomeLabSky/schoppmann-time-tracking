const config = require('../config');
const SessionService = require('../services/sessionService');
const { readCookies } = require('../utils/authCookies');

/**
 * Authentifizierung über das httpOnly-Cookie mit dem Zugriffs-Token.
 *
 * Bei jeder Anfrage wird zusätzlich gegen die Datenbank geprüft, ob die Sitzung noch gültig und der Benutzer
 * aktiv ist. Rolle, Name und E-Mail stammen aus der Datenbank, nicht aus dem Token: Abmelden, Sperren und
 * Rollenänderungen wirken sofort.
 *
 * Fehlerantworten (immer 401, außer fehlende Berechtigung = 403):
 *   MISSING_TOKEN / TOKEN_EXPIRED → das Frontend versucht still eine Erneuerung
 *   INVALID_TOKEN / SESSION_ENDED / USER_INACTIVE → erneute Anmeldung nötig
 */

const fail = (res, status, code, error) => res.status(status).json({ success: false, error, code });

/** Setzt `req.user`; liefert false, wenn bereits mit einer Fehlerantwort geantwortet wurde. */
const authenticate = async (req, res) => {
  if (req.user && req.user.sid) return true; // in dieser Anfrage bereits geprüft

  const token = readCookies(req)[config.auth.accessCookie];
  if (!token) {
    fail(res, 401, 'MISSING_TOKEN', 'Nicht angemeldet');
    return false;
  }

  try {
    const { user, sid } = await SessionService.authenticate(token);
    req.user = { userId: user.id, email: user.email, role: user.role, name: user.name, sid };
    return true;
  } catch (error) {
    if (error.name === 'SessionError') {
      fail(res, 401, error.code, error.message);
      return false;
    }
    throw error;
  }
};

const authenticateToken = async (req, res, next) => {
  try {
    if (await authenticate(req, res)) next();
  } catch (error) {
    next(error);
  }
};

const requireRole = (allowedRoles, message) => async (req, res, next) => {
  try {
    if (!(await authenticate(req, res))) return;
    if (!allowedRoles.includes(req.user.role)) {
      console.log(`❌ Zugriff verweigert: ${req.user.email} (${req.user.role}) → ${req.method} ${req.originalUrl}`);
      return fail(res, 403, 'INSUFFICIENT_PERMISSIONS', message);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Admin-only
const requireAdmin = requireRole(['admin'], 'Administratorrechte erforderlich');
// Mitarbeiter oder Admin
const requireEmployee = requireRole(['mitarbeiter', 'admin'], 'Mitarbeiter-Rechte erforderlich');

module.exports = {
  authenticateToken,
  requireAdmin,
  requireEmployee
};
