/**
 * Auth-Routen (/api/auth).
 *
 * Dünne Controller-Schicht: delegiert die Geschäftslogik an UserService und
 * TokenService und übersetzt Domänenfehler (Format `CODE:Nachricht`) in den
 * HTTP-Vertrag ({ success, error, code }). Enthält selbst keine
 * Sequelize-Queries oder Token-Erzeugung mehr.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const UserService = require('../services/userService');
const TokenService = require('../services/tokenService');
const { validateRegistration, validateLogin, handleValidationErrors, sanitizeInput } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { sendServiceError } = require('../utils/serviceErrors');

const router = express.Router();

// ✅ REGISTRIERUNG
router.post('/register',
  ...validateRegistration,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, name } = req.body;

      // Rolle bewusst NICHT aus dem Body übernehmen → immer Standardrolle.
      const user = await UserService.createUser({ email, password, name });
      const { accessToken, refreshToken } = TokenService.generateTokens(user);

      console.log(`✅ Neue Registrierung: ${user.email}`);

      res.status(201).json({
        success: true,
        message: 'Registrierung erfolgreich',
        data: { accessToken, refreshToken, user }
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
    try {
      const { email, password } = req.body;
      const { user, tokens } = await UserService.authenticateUser(email, password);

      console.log(`✅ Login: ${user.email} (${user.role})`);

      res.json({
        success: true,
        message: 'Login erfolgreich',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user
        }
      });
    } catch (error) {
      sendServiceError(res, error, {
        status: 500,
        code: 'LOGIN_ERROR',
        error: 'Login fehlgeschlagen'
      });
    }
  }
);

// ✅ TOKEN REFRESH
// Verifikation bewusst über rohes jwt.verify, damit bereits ausgegebene
// Refresh-Tokens (ohne issuer/audience/tokenType) gültig bleiben.
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: 'Refresh Token erforderlich',
      code: 'MISSING_REFRESH_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const user = await UserService.findUserById(decoded.userId);

    if (!user) {
      return res.status(403).json({
        success: false,
        error: 'User nicht gefunden oder inaktiv',
        code: 'USER_NOT_FOUND'
      });
    }

    const { accessToken, refreshToken: newRefreshToken } = TokenService.generateTokens(user);

    console.log(`🔄 Token refresh für ${user.email}`);

    res.json({
      success: true,
      message: 'Token erfolgreich erneuert',
      data: { accessToken, refreshToken: newRefreshToken, user }
    });
  } catch (error) {
    console.error('Token refresh Fehler:', error);
    res.status(403).json({
      success: false,
      error: 'Ungültiger Refresh Token',
      code: 'INVALID_REFRESH_TOKEN'
    });
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

    console.log(`📋 Profil abgerufen: ${user.email}`);

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

// ✅ PASSWORT ÄNDERN (geschützt)
router.put('/change-password',
  authenticateToken,
  [
    sanitizeInput,
    require('express-validator').body('currentPassword')
      .notEmpty()
      .withMessage('Aktuelles Passwort ist erforderlich'),
    require('express-validator').body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Neues Passwort muss mindestens 8 Zeichen haben')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Neues Passwort muss Groß-, Kleinbuchstaben und mindestens eine Zahl enthalten'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await UserService.changeUserPassword(req.user.userId, currentPassword, newPassword);

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

// ✅ LOGOUT (bei JWT clientseitig; Platz für spätere Token-Blacklist)
router.post('/logout', authenticateToken, (req, res) => {
  console.log(`👋 Logout: ${req.user.email}`);
  res.json({
    success: true,
    message: 'Erfolgreich abgemeldet'
  });
});

module.exports = router;
