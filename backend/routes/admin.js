/**
 * Admin-Routen (/api/admin) – nur für Admins.
 *
 * User-Verwaltung (CRUD, Status, Statistiken) delegiert an UserService.
 * Die Ops-Routen (ersten Admin anlegen, Datenbank-Reset) greifen bewusst
 * direkt auf die Models zu – seltene, klar abgegrenzte Wartungsaktionen.
 */
const express = require('express');
const { Op } = require('sequelize');
const { User, MinijobSetting } = require('../models');
const UserService = require('../services/userService');
const { validateRegistration, validateUserUpdate, validateUserSettings, handleValidationErrors } = require('../middleware/validation');
const { requireAdmin } = require('../middleware/auth');
const { sendServiceError } = require('../utils/serviceErrors');

const router = express.Router();

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
      const user = await UserService.createUser({ email, password, name, role });

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
      const user = await UserService.adminUpdateUser(req.params.id, req.body);

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
      const user = await UserService.adminUpdateUserSettings(req.params.id, req.body);

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
    const user = await UserService.toggleUserStatus(req.params.id, req.user.userId);

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
    const deletedUser = await UserService.deleteUser(req.params.id, req.user.userId);

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

// ============================================================================
// Ops-/Wartungsrouten – direkter Model-Zugriff bewusst beibehalten.
// ============================================================================

// ✅ ERSTEN ADMIN ERSTELLEN (Legacy; öffentlicher Weg: /api/setup/create-first-admin)
router.get('/create-first-admin', async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ where: { role: 'admin' } });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Admin bereits vorhanden',
        code: 'ADMIN_EXISTS',
        data: { existingAdmin: { email: existingAdmin.email, name: existingAdmin.name, role: existingAdmin.role } }
      });
    }

    const admin = await User.create({
      email: 'admin@schoppmann.de',
      password: 'Admin123!',
      name: 'Administrator',
      role: 'admin',
      isActive: true
    });

    console.log('🔑 Erster Admin wurde erstellt!');
    res.json({
      success: true,
      message: 'Erster Admin erfolgreich erstellt',
      data: {
        admin: admin.toSafeJSON(),
        loginDaten: { email: 'admin@schoppmann.de', passwort: 'Admin123!' }
      }
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Admins:', error);
    res.status(500).json({ success: false, error: 'Admin konnte nicht erstellt werden', code: 'ADMIN_CREATE_ERROR' });
  }
});

// ✅ DATABASE RESET (nur Admin) - VORSICHT!
router.post('/reset-database', requireAdmin, async (req, res) => {
  try {
    console.log(`🔄 Admin ${req.user.email} startet Database Reset...`);

    await MinijobSetting.destroy({ where: {} });
    await User.destroy({ where: { id: { [Op.ne]: req.user.userId } } });

    const currentAdmin = await User.findByPk(req.user.userId);
    if (currentAdmin) {
      await currentAdmin.update({
        stundenlohn: 12.00,
        abrechnungStart: 1,
        abrechnungEnde: 31,
        lohnzettelEmail: null
      });
    }

    const standardMinijobSetting = await MinijobSetting.create({
      monthlyLimit: 538.00,
      description: 'Standard Minijob-Grenze (Stand 2024)',
      validFrom: '2024-01-01',
      validUntil: null,
      createdBy: req.user.userId
    });

    await MinijobSetting.updateActiveStatus();

    console.log(`🎉 Database Reset abgeschlossen von Admin ${req.user.email}`);
    res.json({
      success: true,
      message: 'Datenbank erfolgreich zurückgesetzt',
      data: {
        adminBeibehalten: { id: currentAdmin?.id, email: currentAdmin?.email, name: currentAdmin?.name },
        standardMinijobSetting: { limit: standardMinijobSetting.monthlyLimit, description: standardMinijobSetting.description },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Fehler beim Database Reset:', error);
    res.status(500).json({ success: false, error: 'Database Reset fehlgeschlagen', code: 'DATABASE_RESET_ERROR', details: error.message });
  }
});

// ✅ SICHERE DATABASE RESET ROUTE MIT BESTÄTIGUNG
router.post('/reset-database-confirm', requireAdmin, async (req, res) => {
  const { confirmation } = req.body;

  if (confirmation !== 'RESET_ALL_DATA_CONFIRM') {
    return res.status(400).json({
      success: false,
      error: 'Bestätigung erforderlich',
      code: 'CONFIRMATION_REQUIRED',
      data: { requiredConfirmation: 'RESET_ALL_DATA_CONFIRM' }
    });
  }

  try {
    console.log(`🔄 BESTÄTIGTER Database Reset von Admin ${req.user.email}`);

    await MinijobSetting.destroy({ where: {} });
    await User.destroy({ where: {} });

    const newAdmin = await User.create({
      email: 'admin@schoppmann.de',
      password: 'Admin123!',
      name: 'Administrator',
      role: 'admin',
      isActive: true
    });

    await MinijobSetting.create({
      monthlyLimit: 538.00,
      description: 'Standard Minijob-Grenze (Stand 2024)',
      validFrom: '2024-01-01',
      validUntil: null,
      createdBy: newAdmin.id
    });

    await MinijobSetting.updateActiveStatus();

    console.log('🎉 Kompletter Database Reset mit neuem Admin abgeschlossen');
    res.json({
      success: true,
      message: 'Datenbank komplett zurückgesetzt - Bitte erneut einloggen',
      data: { newAdminCredentials: { email: 'admin@schoppmann.de', password: 'Admin123!' } }
    });
  } catch (error) {
    console.error('❌ Fehler beim kompletten Reset:', error);
    res.status(500).json({ success: false, error: 'Reset fehlgeschlagen', code: 'COMPLETE_RESET_ERROR' });
  }
});

module.exports = router;
