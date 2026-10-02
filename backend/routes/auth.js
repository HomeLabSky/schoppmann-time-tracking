/**
 * Auth-Routen (/api/auth).
 *
 * Die Anmeldung läuft über httpOnly-Cookies (siehe utils/authCookies.js); Tokens erscheinen nie im
 * Antwort-Body. Dünne Controller-Schicht: UserService prüft Zugangsdaten, SessionService verwaltet
 * Sitzungen und Tokens, AuditService hält Anmeldungen, Fehlversuche und Abmeldungen fest.
 */
const express = require('express');
const { body } = require('express-validator');
const config = require('../config');
const UserService = require('../services/userService');
const SessionService = require('../services/sessionService');
const AuditService = require('../services/auditService');
const { validateRegistration, validateLogin, handleValidationErrors, sanitizeInput } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { sendServiceError, extractKnownError } = require('../utils/serviceErrors');
const { setAuthCookies, clearAuthCookies, readCookies } = require('../utils/authCookies');

const router = express.Router();

const clientContext = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

/** Protokolleintrag für Anmelde-Ereignisse; ein Fehler beim Protokollieren darf die Anmeldung nicht verhindern. */
const audit = (entry) =>
  AuditService.record(entry).catch((error) => console.error('Audit-Eintrag fehlgeschlagen:', error.message));

const startSession = async (req, res, user) => {
  const session = await SessionService.createSession(user, clientContext(req));
  setAuthCookies(res, session);
  return session;
};

// ✅ REGISTRIERUNG (nur wenn ALLOW_REGISTRATION aktiviert ist; sonst legt ein Admin Konten an)
const requireRegistrationEnabled = (req, res, next) => {
  if (!config.allowRegistration) {
    return res.status(403).json({
      success: false,
      error: 'Selbstregistrierung ist deaktiviert. Bitte wenden Sie sich an einen Administrator.',
      code: 'REGISTRATION_DISABLED'
    });
  }
  next();
};

router.post('/register',
  requireRegistrationEnabled,
  ...validateRegistration,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, name } = req.body;

      // Rolle bewusst NICHT aus dem Body übernehmen → immer Standardrolle.
      const user = await UserService.createUser({ email, password, name });
      await startSession(req, res, user);
      await audit({ actor: { id: user.id, email: user.email }, action: 'auth.login', entityType: 'Session', targetUserId: user.id, meta: { via: 'registration', ip: req.ip } });

      console.log(`✅ Neue Registrierung: ${user.email}`);

      res.status(201).json({
        success: true,
        message: 'Registrierung erfolgreich',
        data: { user }
      });
    } catch (error) {
      sendServiceError(res, error, {
        status: 500,
        code: 'REGISTRATION_ERROR',
        error: 'Registrierung fehlgeschlagen'
      });
    }
  }
);

// ✅ LOGIN
router.post('/login',
  ...validateLogin,
  handleValidationErrors,
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const { user } = await UserService.authenticateUser(email, password);
      await startSession(req, res, user);
      await audit({ actor: { id: user.id, email: user.email }, action: 'auth.login', entityType: 'Session', targetUserId: user.id, meta: { ip: req.ip } });

      console.log(`✅ Login: ${user.email} (${user.role})`);

      res.json({
        success: true,
        message: 'Login erfolgreich',
        data: { user }
      });
    } catch (error) {
      const known = extractKnownError(error && error.message);
      if (known && (known.code === 'INVALID_CREDENTIALS' || known.code === 'USER_INACTIVE')) {
        const existing = await UserService.findUserByEmail(email, true).catch(() => null);
        await audit({
          actor: null,
          action: 'auth.login_failed',
          entityType: 'Session',
          targetUserId: existing ? existing.id : null,
          meta: { email: String(email).slice(0, 255), reason: known.code, ip: req.ip }
        });
      }
      sendServiceError(res, error, {
        status: 500,
        code: 'LOGIN_ERROR',
        error: 'Login fehlgeschlagen'
      });
    }
  }
);

// ✅ SITZUNG ERNEUERN (Erneuerungs-Token aus dem Cookie, wird rotiert)
router.post('/refresh', async (req, res) => {
  const refreshToken = readCookies(req)[config.auth.refreshCookie];

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: 'Nicht angemeldet',
      code: 'MISSING_REFRESH_TOKEN'
    });
  }

  try {
    const { user, accessToken, refreshToken: nextRefreshToken } = await SessionService.rotate(refreshToken);
    setAuthCookies(res, { accessToken, refreshToken: nextRefreshToken });

    res.json({
      success: true,
      message: 'Sitzung erfolgreich erneuert',
      data: { user: user.toSafeJSON() }
    });
  } catch (error) {
    if (error.name !== 'SessionError') {
      console.error('Sitzungserneuerung fehlgeschlagen:', error);
      return res.status(500).json({ success: false, error: 'Sitzung konnte nicht erneuert werden', code: 'REFRESH_ERROR' });
    }

    // Zwei Tabs erneuern gleichzeitig: nichts löschen, der Client versucht es mit dem neuen Cookie erneut
    if (error.code === 'REFRESH_IN_PROGRESS') {
      return res.status(409).json({ success: false, error: error.message, code: error.code });
    }

    if (error.code === 'REFRESH_TOKEN_REUSED') {
      await audit({
        actor: null,
        action: 'auth.session_reuse_detected',
        entityType: 'Session',
        targetUserId: error.userId ?? null,
        meta: { ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 255) }
      });
      console.warn(`🚨 Erneuerungs-Token wiederverwendet (Benutzer ${error.userId}) – Sitzung beendet`);
    }

    clearAuthCookies(res);
    res.status(401).json({ success: false, error: error.message, code: error.code });
  }
});

// ✅ PROFIL (geschützt)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await UserService.findUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Benutzer nicht gefunden',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Profil erfolgreich geladen',
      data: { user }
    });
  } catch (error) {
    console.error('Profil-Abruf Fehler:', error);
    res.status(500).json({
      success: false,
      error: 'Profil konnte nicht geladen werden',
      code: 'PROFILE_ERROR'
    });
  }
});

// ✅ PROFIL AKTUALISIEREN (geschützt)
router.put('/profile',
  authenticateToken,
  sanitizeInput,
  async (req, res) => {
    try {
      const { name, email } = req.body;

      // Nur gesetzte Felder weiterreichen.
      const updateData = {};
      if (name && name.trim()) updateData.name = name.trim();
      if (email) updateData.email = email;

      const user = await UserService.updateUserProfile(req.user.userId, updateData);

      console.log(`✏️ Profil aktualisiert: ${user.email}`);

      res.json({
        success: true,
        message: 'Profil erfolgreich aktualisiert',
        data: { user }
      });
    } catch (error) {
      sendServiceError(res, error, {
        status: 500,
        code: 'PROFILE_UPDATE_ERROR',
        error: 'Profil konnte nicht aktualisiert werden'
      });
    }
  }
);

// ✅ PASSWORT ÄNDERN (geschützt) – beendet alle anderen Sitzungen des Benutzers
router.put('/change-password',
  authenticateToken,
  [
    sanitizeInput,
    body('currentPassword')
      .notEmpty()
      .withMessage('Aktuelles Passwort ist erforderlich'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Neues Passwort muss mindestens 8 Zeichen haben')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Neues Passwort muss Groß-, Kleinbuchstaben und mindestens eine Zahl enthalten'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await UserService.changeUserPassword(req.user.userId, currentPassword, newPassword, undefined, req.user.sid);

      console.log(`🔐 Passwort geändert: User ${req.user.userId}`);

      res.json({
        success: true,
        message: 'Passwort erfolgreich geändert'
      });
    } catch (error) {
      sendServiceError(res, error, {
        status: 500,
        code: 'PASSWORD_CHANGE_ERROR',
        error: 'Passwort konnte nicht geändert werden'
      });
    }
  }
);

// ✅ LOGOUT: beendet die Sitzung serverseitig und löscht die Cookies.
// Bewusst ohne vorherige Anmeldeprüfung – auch mit abgelaufenem Zugriffs-Token muss man sich abmelden können.
router.post('/logout', async (req, res) => {
  const cookies = readCookies(req);
  try {
    const ended = await SessionService.logout({
      refreshToken: cookies[config.auth.refreshCookie],
      accessToken: cookies[config.auth.accessCookie]
    });
    if (ended) {
      await audit({ actor: { id: ended.userId, email: ended.email }, action: 'auth.logout', entityType: 'Session', targetUserId: ended.userId, meta: { ip: req.ip } });
    }
  } catch (error) {
    console.error('Logout Fehler:', error);
  }
  clearAuthCookies(res);
  res.json({ success: true, message: 'Erfolgreich abgemeldet' });
});

module.exports = router;
