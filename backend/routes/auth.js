const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { User } = require('../models');
const { validateRegistration, validateLogin, handleValidationErrors, sanitizeInput } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ✅ JWT Helper Functions
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  const refreshToken = jwt.sign(
    {
      userId: user.id,
      role: user.role
    },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
};

// ✅ REGISTRIERUNG
router.post('/register', 
  ...validateRegistration,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, name } = req.body;

      // Prüfen ob User bereits existiert
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ 
          success: false,
          error: 'Email bereits registriert',
          code: 'EMAIL_EXISTS'
        });
      }

      // Neuen User erstellen
      const user = await User.create({ 
        email, 
        password, 
        name,
        role: 'mitarbeiter' // Standard-Rolle
      });

      const { accessToken, refreshToken } = generateTokens(user);

      console.log(`✅ Neue Registrierung: ${email}`);

      res.status(201).json({
        success: true,
        message: 'Registrierung erfolgreich',
        data: {
          accessToken,
          refreshToken,
          user: user.toSafeJSON()
        }
      });
    } catch (error) {
      console.error('Registrierung Fehler:', error);
      res.status(500).json({ 
        success: false,
        error: 'Registrierung fehlgeschlagen',
        code: 'REGISTRATION_ERROR'
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

      // User finden
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({ 
          success: false,
          error: 'Email oder Passwort falsch',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Passwort prüfen
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(401).json({ 
          success: false,
          error: 'Email oder Passwort falsch',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // User aktiv?
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Benutzer ist deaktiviert',
          code: 'USER_INACTIVE'
        });
      }

      const { accessToken, refreshToken } = generateTokens(user);

      console.log(`✅ Login: ${email} (${user.role})`);

      res.json({
        success: true,
        message: 'Login erfolgreich',
        data: {
          accessToken,
          refreshToken,
          user: user.toSafeJSON()
        }
      });
    } catch (error) {
      console.error('Login Fehler:', error);
      res.status(500).json({ 
        success: false,
        error: 'Login fehlgeschlagen',
        code: 'LOGIN_ERROR'
      });
    }
  }
);

// ✅ TOKEN REFRESH
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
    const user = await User.findByPk(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'User nicht gefunden oder inaktiv',
        code: 'USER_NOT_FOUND'
      });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    console.log(`🔄 Token refresh für ${user.email}`);

    res.json({
      success: true,
      message: 'Token erfolgreich erneuert',
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        user: user.toSafeJSON()
      }
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
    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ['password'] }
    });

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
      data: {
        user: user.toSafeJSON()
      }
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
      const user = await User.findByPk(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Benutzer nicht gefunden',
          code: 'USER_NOT_FOUND'
        });
      }

      // Update-Daten vorbereiten
      const updateData = {};
      if (name && name.trim()) updateData.name = name.trim();
      if (email && email !== user.email) {
        // Email-Eindeutigkeit prüfen
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            error: 'Email bereits vergeben',
            code: 'EMAIL_EXISTS'
          });
        }
        updateData.email = email;
      }

      // User aktualisieren
      if (Object.keys(updateData).length > 0) {
        await user.update(updateData);
        console.log(`✏️ Profil aktualisiert: ${user.email}`);
      }

      res.json({
        success: true,
        message: 'Profil erfolgreich aktualisiert',
        data: {
          user: user.toSafeJSON()
        }
      });
    } catch (error) {
      console.error('Profil-Update Fehler:', error);
      res.status(500).json({
        success: false,
        error: 'Profil konnte nicht aktualisiert werden',
        code: 'PROFILE_UPDATE_ERROR'
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
      const user = await User.findByPk(req.user.userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Benutzer nicht gefunden',
          code: 'USER_NOT_FOUND'
        });
      }

      // Aktuelles Passwort prüfen
      const isValidPassword = await user.comparePassword(currentPassword);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Aktuelles Passwort ist falsch',
          code: 'INVALID_CURRENT_PASSWORD'
        });
      }

      // Neues Passwort setzen
      await user.update({ password: newPassword });

      console.log(`🔐 Passwort geändert: ${user.email}`);

      res.json({
        success: true,
        message: 'Passwort erfolgreich geändert'
      });
    } catch (error) {
      console.error('Passwort-Änderung Fehler:', error);
      res.status(500).json({
        success: false,
        error: 'Passwort konnte nicht geändert werden',
        code: 'PASSWORD_CHANGE_ERROR'
      });
    }
  }
);

// ✅ LOGOUT (optional - für erweiterte Session-Verwaltung)
router.post('/logout', authenticateToken, (req, res) => {
  // Bei JWT-basierter Auth passiert Logout client-seitig
  // Hier könnte man eine Token-Blacklist implementieren
  console.log(`👋 Logout: ${req.user.email}`);
  
  res.json({
    success: true,
    message: 'Erfolgreich abgemeldet'
  });
});

module.exports = router;