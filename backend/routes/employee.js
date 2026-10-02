/**
 * Employee-Routen (/api/employee) – Self-Service für eingeloggte Nutzer.
 *
 * Dünne Controller-Schicht: Geschäftslogik liegt im UserService, Lese-Zugriffe
 * laufen über UserService.findUserById. Minijob-Daten kommen read-only aus dem
 * Model. Antwortformate folgen dem Vertrag ({ success, message, data }).
 */
const express = require('express');
const { MinijobSetting } = require('../models');
const UserService = require('../services/userService');
const SessionService = require('../services/sessionService');
const { clearAuthCookies } = require('../utils/authCookies');
const { validateUserSettings, handleValidationErrors, sanitizeInput } = require('../middleware/validation');
const { requireEmployee, authenticateToken } = require('../middleware/auth');
const { sendServiceError } = require('../utils/serviceErrors');

const router = express.Router();

/**
 * Lädt den eingeloggten Nutzer (inkl. inaktiver) und sendet bei Fehlen/Inaktiv
 * die passende Vertragsantwort. Gibt `null` zurück, wenn bereits geantwortet
 * wurde.
 * @param {object} req @param {object} res
 * @param {boolean} rejectInactive 403 wenn Nutzer deaktiviert ist
 */
const loadSelf = async (req, res, rejectInactive = true) => {
  const user = await UserService.findUserById(req.user.userId, true);
  if (!user) {
    res.status(404).json({ success: false, error: 'Benutzer nicht gefunden', code: 'USER_NOT_FOUND' });
    return null;
  }
  if (rejectInactive && !user.isActive) {
    res.status(403).json({ success: false, error: 'Benutzer ist deaktiviert', code: 'USER_INACTIVE' });
    return null;
  }
  return user;
};

// ✅ EIGENES PROFIL ABRUFEN (Mitarbeiter + Admin)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await loadSelf(req, res);
    if (!user) return;

    console.log(`📋 Profil abgerufen: ${user.email}`);
    res.json({ success: true, message: 'Profil erfolgreich geladen', data: { user } });
  } catch (error) {
    console.error('Fehler beim Abrufen des Profils:', error);
    res.status(500).json({ success: false, error: 'Profil konnte nicht geladen werden', code: 'PROFILE_LOAD_ERROR' });
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
      const updateData = {};
      if (name && name.trim()) updateData.name = name.trim();
      if (email) updateData.email = email;

      const user = await UserService.updateUserProfile(req.user.userId, updateData);

      console.log(`✏️ Profil aktualisiert: ${user.email}`);
      res.json({ success: true, message: 'Profil erfolgreich aktualisiert', data: { user } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'PROFILE_UPDATE_ERROR', error: 'Profil konnte nicht aktualisiert werden' });
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
      await UserService.changeUserPassword(req.user.userId, currentPassword, newPassword, undefined, req.user.sid);

      console.log(`🔐 Passwort geändert: User ${req.user.userId}`);
      res.json({ success: true, message: 'Passwort erfolgreich geändert' });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'PASSWORD_CHANGE_ERROR', error: 'Passwort konnte nicht geändert werden' });
    }
  }
);

// ✅ EIGENE ARBEITSEINSTELLUNGEN ABRUFEN (Mitarbeiter + Admin)
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = await loadSelf(req, res);
    if (!user) return;

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
        userInfo: { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Arbeitseinstellungen:', error);
    res.status(500).json({ success: false, error: 'Arbeitseinstellungen konnten nicht geladen werden', code: 'SETTINGS_LOAD_ERROR' });
  }
});

// ✅ EIGENE ARBEITSEINSTELLUNGEN AKTUALISIEREN (nur Mitarbeiter/Admin)
router.put('/settings',
  requireEmployee,
  ...validateUserSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const settings = await UserService.updateUserSettings(req.user.userId, req.body);

      console.log(`⚙️ Arbeitseinstellungen aktualisiert: User ${req.user.userId}`);
      res.json({ success: true, message: 'Arbeitseinstellungen erfolgreich aktualisiert', data: { settings } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'SETTINGS_UPDATE_ERROR', error: 'Arbeitseinstellungen konnten nicht aktualisiert werden' });
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
        data: { message: 'Bitte wenden Sie sich an einen Administrator' }
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
    res.status(500).json({ success: false, error: 'Aktuelle Minijob-Einstellung konnte nicht geladen werden', code: 'MINIJOB_CURRENT_ERROR' });
  }
});

// ✅ BENUTZER-DASHBOARD INFORMATIONEN (Mitarbeiter + Admin)
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await loadSelf(req, res);
    if (!user) return;

    const currentMinijobSetting = await MinijobSetting.getCurrentSetting();

    console.log(`📊 Dashboard-Daten abgerufen: ${user.email}`);
    res.json({
      success: true,
      message: 'Dashboard-Daten erfolgreich geladen',
      data: {
        user,
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
        stats: { currentMonth: { hoursWorked: 0, earnings: 0 } }
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Dashboard-Daten:', error);
    res.status(500).json({ success: false, error: 'Dashboard-Daten konnten nicht geladen werden', code: 'DASHBOARD_ERROR' });
  }
});

// ✅ ACCOUNT-STATUS PRÜFEN (Mitarbeiter + Admin)
router.get('/account-status', authenticateToken, async (req, res) => {
  try {
    // Auch deaktivierte Accounts liefern hier einen Status (kein 403).
    const user = await loadSelf(req, res, false);
    if (!user) return;

    const status = user.isActive ? 'active' : 'inactive';
    const message = user.isActive
      ? 'Account ist aktiv und verfügbar'
      : 'Account ist deaktiviert - bitte wenden Sie sich an einen Administrator';

    console.log(`🔍 Account-Status geprüft: ${user.email} - ${status}`);
    res.json({
      success: true,
      message: 'Account-Status erfolgreich ermittelt',
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        status: {
          isActive: user.isActive,
          statusCode: status,
          message,
          memberSince: user.createdAt,
          lastUpdated: user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Prüfen des Account-Status:', error);
    res.status(500).json({ success: false, error: 'Account-Status konnte nicht ermittelt werden', code: 'ACCOUNT_STATUS_ERROR' });
  }
});

// ✅ LOGOUT: beendet die Sitzung serverseitig und löscht die Cookies
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await SessionService.revoke(req.user.sid, 'logout');
  } catch (error) {
    console.error('Logout Fehler:', error);
  }
  clearAuthCookies(res);
  console.log(`👋 Logout: ${req.user.email} (${req.user.role})`);
  res.json({
    success: true,
    message: 'Erfolgreich abgemeldet',
    data: {
      user: { email: req.user.email, name: req.user.name },
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
