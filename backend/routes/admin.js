/**
 * Admin-Routen (/api/admin) – nur für Admins.
 *
 * User-Verwaltung (CRUD, Status, Statistiken) delegiert an UserService.
 * Wartungsaktionen (ersten Admin anlegen, Passwort zurücksetzen) laufen bewusst
 * NICHT über HTTP, sondern als CLI-Skripte (npm run admin:create / user:reset-password).
 */
const express = require('express');
const UserService = require('../services/userService');
const { validateRegistration, validateUserUpdate, validateUserSettings, handleValidationErrors } = require('../middleware/validation');
const { requireAdmin } = require('../middleware/auth');
const { sendServiceError } = require('../utils/serviceErrors');

const router = express.Router();

// Auslöser für das Änderungsprotokoll
const actorOf = (req) => ({ id: req.user.userId, email: req.user.email });

// ✅ ALLE USER AUFLISTEN (nur Admin)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', role = '' } = req.query;
    const result = await UserService.getAllUsers({ page, limit, search, role });

    console.log(`📋 Admin ${req.user.email} hat User-Liste abgerufen (${result.users.length}/${result.pagination.total})`);
    res.json({ success: true, message: 'User-Liste erfolgreich geladen', data: result });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'USER_LIST_ERROR', error: 'User-Liste konnte nicht geladen werden' });
  }
});

// ✅ EINZELNEN USER ABRUFEN (nur Admin)
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await UserService.findUserById(req.params.id, true);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden', code: 'USER_NOT_FOUND' });
    }

    console.log(`👤 Admin ${req.user.email} hat User ${user.email} abgerufen`);
    res.json({ success: true, message: 'Benutzer erfolgreich geladen', data: { user } });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'USER_LOAD_ERROR', error: 'Benutzer konnte nicht geladen werden' });
  }
});

// ✅ NEUEN USER ERSTELLEN (nur Admin)
router.post('/users',
  requireAdmin,
  ...validateRegistration,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password, name, role = 'mitarbeiter' } = req.body;
      const user = await UserService.createUser({ email, password, name, role }, actorOf(req));

      console.log(`➕ Admin ${req.user.email} hat neuen User erstellt: ${user.email} (${user.role})`);
      res.status(201).json({ success: true, message: 'Benutzer erfolgreich erstellt', data: { user } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'USER_CREATE_ERROR', error: 'Benutzer konnte nicht erstellt werden' });
    }
  }
);

// ✅ USER BEARBEITEN (nur Admin)
router.put('/users/:id',
  requireAdmin,
  ...validateUserUpdate,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await UserService.adminUpdateUser(req.params.id, req.body, actorOf(req));

      console.log(`✏️ Admin ${req.user.email} hat User ${user.email} bearbeitet`);
      res.json({ success: true, message: 'Benutzer erfolgreich aktualisiert', data: { user } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'USER_UPDATE_ERROR', error: 'Benutzer konnte nicht aktualisiert werden' });
    }
  }
);

// ✅ USER EINSTELLUNGEN BEARBEITEN (nur Admin)
router.put('/users/:id/settings',
  requireAdmin,
  ...validateUserSettings,
  handleValidationErrors,
  async (req, res) => {
    try {
      const user = await UserService.adminUpdateUserSettings(req.params.id, req.body, actorOf(req));

      console.log(`⚙️ Admin ${req.user.email} hat Einstellungen für ${user.email} aktualisiert`);
      res.json({ success: true, message: 'Einstellungen erfolgreich aktualisiert', data: { user } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'USER_SETTINGS_ERROR', error: 'Einstellungen konnten nicht aktualisiert werden' });
    }
  }
);

// ✅ USER DEAKTIVIEREN/AKTIVIEREN (nur Admin)
router.patch('/users/:id/toggle-status', requireAdmin, async (req, res) => {
  try {
    const user = await UserService.toggleUserStatus(req.params.id, actorOf(req));

    console.log(`🔄 Admin ${req.user.email} hat User ${user.email} ${user.isActive ? 'aktiviert' : 'deaktiviert'}`);
    res.json({
      success: true,
      message: `Benutzer erfolgreich ${user.isActive ? 'aktiviert' : 'deaktiviert'}`,
      data: { user }
    });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'USER_STATUS_ERROR', error: 'Status konnte nicht geändert werden' });
  }
});

// ✅ USER LÖSCHEN (nur Admin)
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const deletedUser = await UserService.deleteUser(req.params.id, actorOf(req));

    console.log(`🗑️ Admin ${req.user.email} hat User ${deletedUser.email} (${deletedUser.name}) gelöscht`);
    res.json({ success: true, message: 'Benutzer erfolgreich gelöscht', data: { deletedUser } });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'USER_DELETE_ERROR', error: 'Benutzer konnte nicht gelöscht werden' });
  }
});

// ✅ USER-STATISTIKEN (nur Admin)
router.get('/stats/users', requireAdmin, async (req, res) => {
  try {
    const stats = await UserService.getUserStats();

    console.log(`📊 Admin ${req.user.email} hat User-Statistiken abgerufen`);
    res.json({ success: true, message: 'User-Statistiken erfolgreich geladen', data: stats });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'USER_STATS_ERROR', error: 'User-Statistiken konnten nicht geladen werden' });
  }
});

module.exports = router;
