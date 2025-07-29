const express = require('express');
const { User, MinijobSetting } = require('../models');
const { validateUserSettings, handleValidationErrors, sanitizeInput } = require('../middleware/validation');
const { requireEmployee, authenticateToken } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

// ✅ EIGENES PROFIL ABRUFEN (Mitarbeiter + Admin)
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

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Benutzer ist deaktiviert',
        code: 'USER_INACTIVE'
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
    console.error('Fehler beim Abrufen des Profils:', error);
    res.status(500).json({
      success: false,
      error: 'Profil konnte nicht geladen werden',
      code: 'PROFILE_LOAD_ERROR'
    });
  }
});

// ✅ EIGENES PROFIL AKTUALISIEREN (Mitarbeiter + Admin)
router.put('/profile', 
  authenticateToken,
  sanitizeInput,
  [
    require('express-validator').body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name muss zwischen 2 und 50 Zeichen haben')
      .matches(/^[a-zA-ZäöüÄÖÜß\s\-'\.]+$/)
      .withMessage('Name darf nur Buchstaben, Leerzeichen, Bindestriche und Apostrophe enthalten'),
    require('express-validator').body('email')
      .optional()
      .isEmail()
      .withMessage('Bitte eine gültige Email-Adresse eingeben')
      .normalizeEmail(),
    handleValidationErrors
  ],
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

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Benutzer ist deaktiviert',
          code: 'USER_INACTIVE'
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
      console.error('Fehler beim Aktualisieren des Profils:', error);
      res.status(500).json({
        success: false,
        error: 'Profil konnte nicht aktualisiert werden',
        code: 'PROFILE_UPDATE_ERROR'
      });
    }
  }
);

// ✅ PASSWORT ÄNDERN (Mitarbeiter + Admin)
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
    require('express-validator').body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Passwort-Bestätigung stimmt nicht überein');
        }
        return true;
      }),
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

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Benutzer ist deaktiviert',
          code: 'USER_INACTIVE'
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
      console.error('Fehler beim Ändern des Passworts:', error);
      res.status(500).json({
        success: false,
        error: 'Passwort konnte nicht geändert werden',
        code: 'PASSWORD_CHANGE_ERROR'
      });
    }
  }
);

// ✅ EIGENE ARBEITSEINSTELLUNGEN ABRUFEN (Mitarbeiter + Admin)
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: [
        'id', 'name', 'email', 'role', 
        'stundenlohn', 'abrechnungStart', 'abrechnungEnde', 'lohnzettelEmail'
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Benutzer nicht gefunden',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Benutzer ist deaktiviert',
        code: 'USER_INACTIVE'
      });
    }

    console.log(`⚙️ Arbeitseinstellungen abgerufen: ${user.email}`);

    res.json({
      success: true,
      message: 'Arbeitseinstellungen erfolgreich geladen',
      data: {
        settings: {
          stundenlohn: user.stundenlohn || 12.00,
          abrechnungStart: user.abrechnungStart || 1,
          abrechnungEnde: user.abrechnungEnde || 31,
          lohnzettelEmail: user.lohnzettelEmail || user.email
        },
        userInfo: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Arbeitseinstellungen:', error);
    res.status(500).json({
      success: false,
      error: 'Arbeitseinstellungen konnten nicht geladen werden',
      code: 'SETTINGS_LOAD_ERROR'
    });
  }
});

// ✅ EIGENE ARBEITSEINSTELLUNGEN AKTUALISIEREN (nur Mitarbeiter können eigene Settings ändern)
router.put('/settings', 
  requireEmployee,
  ...validateUserSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { stundenlohn, abrechnungStart, abrechnungEnde, lohnzettelEmail } = req.body;
      
      const user = await User.findByPk(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'Benutzer nicht gefunden',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Benutzer ist deaktiviert',
          code: 'USER_INACTIVE'
        });
      }

      // Update-Objekt vorbereiten
      const updateData = {};
      if (stundenlohn !== undefined) updateData.stundenlohn = parseFloat(stundenlohn);
      if (abrechnungStart !== undefined) updateData.abrechnungStart = parseInt(abrechnungStart);
      if (abrechnungEnde !== undefined) updateData.abrechnungEnde = parseInt(abrechnungEnde);
      if (lohnzettelEmail !== undefined) updateData.lohnzettelEmail = lohnzettelEmail || null;

      // Einstellungen aktualisieren
      await user.update(updateData);

      console.log(`⚙️ Arbeitseinstellungen aktualisiert: ${user.email}`);

      res.json({
        success: true,
        message: 'Arbeitseinstellungen erfolgreich aktualisiert',
        data: {
          settings: {
            stundenlohn: user.stundenlohn,
            abrechnungStart: user.abrechnungStart,
            abrechnungEnde: user.abrechnungEnde,
            lohnzettelEmail: user.lohnzettelEmail
          }
        }
      });
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Arbeitseinstellungen:', error);
      res.status(500).json({
        success: false,
        error: 'Arbeitseinstellungen konnten nicht aktualisiert werden',
        code: 'SETTINGS_UPDATE_ERROR'
      });
    }
  }
);

// ✅ AKTUELLE MINIJOB-EINSTELLUNG ABRUFEN (Mitarbeiter + Admin, Read-Only)
router.get('/minijob/current', authenticateToken, async (req, res) => {
  try {
    const currentSetting = await MinijobSetting.getCurrentSetting();

    if (!currentSetting) {
      return res.status(404).json({
        success: false,
        error: 'Keine aktuelle Minijob-Einstellung gefunden',
        code: 'NO_CURRENT_SETTING',
        data: {
          message: 'Bitte wenden Sie sich an einen Administrator'
        }
      });
    }

    console.log(`📊 ${req.user.email} hat aktuelle Minijob-Einstellung abgerufen`);

    res.json({
      success: true,
      message: 'Aktuelle Minijob-Einstellung erfolgreich geladen',
      data: {
        setting: {
          id: currentSetting.id,
          monthlyLimit: currentSetting.monthlyLimit,
          description: currentSetting.description,
          validFrom: currentSetting.validFrom,
          validUntil: currentSetting.validUntil,
          isActive: currentSetting.isActive
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der aktuellen Minijob-Einstellung:', error);
    res.status(500).json({
      success: false,
      error: 'Aktuelle Minijob-Einstellung konnte nicht geladen werden',
      code: 'MINIJOB_CURRENT_ERROR'
    });
  }
});

// ✅ BENUTZER-DASHBOARD INFORMATIONEN (Mitarbeiter + Admin)
router.get('/dashboard', authenticateToken, async (req, res) => {
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

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Benutzer ist deaktiviert',
        code: 'USER_INACTIVE'
      });
    }

    // Aktuelle Minijob-Einstellung abrufen
    const currentMinijobSetting = await MinijobSetting.getCurrentSetting();

    // Dashboard-Daten zusammenstellen
    const dashboardData = {
      user: user.toSafeJSON(),
      minijobSetting: currentMinijobSetting ? {
        monthlyLimit: currentMinijobSetting.monthlyLimit,
        description: currentMinijobSetting.description,
        validFrom: currentMinijobSetting.validFrom,
        validUntil: currentMinijobSetting.validUntil
      } : null,
      settings: {
        stundenlohn: user.stundenlohn || 12.00,
        abrechnungStart: user.abrechnungStart || 1,
        abrechnungEnde: user.abrechnungEnde || 31,
        lohnzettelEmail: user.lohnzettelEmail || user.email
      },
      // Platzhalter für zukünftige Features
      stats: {
        // Hier könnten später Zeiterfassungs-Statistiken stehen
        currentMonth: {
          hoursWorked: 0,
          earnings: 0
        }
      }
    };

    console.log(`📊 Dashboard-Daten abgerufen: ${user.email}`);

    res.json({
      success: true,
      message: 'Dashboard-Daten erfolgreich geladen',
      data: dashboardData
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Dashboard-Daten:', error);
    res.status(500).json({
      success: false,
      error: 'Dashboard-Daten konnten nicht geladen werden',
      code: 'DASHBOARD_ERROR'
    });
  }
});

// ✅ ACCOUNT-STATUS PRÜFEN (Mitarbeiter + Admin)
router.get('/account-status', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: ['id', 'email', 'name', 'role', 'isActive', 'createdAt', 'updatedAt']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Benutzer nicht gefunden',
        code: 'USER_NOT_FOUND'
      });
    }

    // Account-Status bestimmen
    let status = 'active';
    let message = 'Account ist aktiv und verfügbar';
    
    if (!user.isActive) {
      status = 'inactive';
      message = 'Account ist deaktiviert - bitte wenden Sie sich an einen Administrator';
    }

    console.log(`🔍 Account-Status geprüft: ${user.email} - ${status}`);

    res.json({
      success: true,
      message: 'Account-Status erfolgreich ermittelt',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        status: {
          isActive: user.isActive,
          statusCode: status,
          message: message,
          memberSince: user.createdAt,
          lastUpdated: user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Prüfen des Account-Status:', error);
    res.status(500).json({
      success: false,
      error: 'Account-Status konnte nicht ermittelt werden',
      code: 'ACCOUNT_STATUS_ERROR'
    });
  }
});

// ✅ LOGOUT (optional - für erweiterte Session-Verwaltung)
router.post('/logout', authenticateToken, (req, res) => {
  // Bei JWT-basierter Auth passiert Logout client-seitig
  // Hier könnte man eine Token-Blacklist implementieren
  console.log(`👋 Logout: ${req.user.email} (${req.user.role})`);
  
  res.json({
    success: true,
    message: 'Erfolgreich abgemeldet',
    data: {
      user: {
        email: req.user.email,
        name: req.user.name
      },
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;