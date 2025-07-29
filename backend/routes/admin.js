const express = require('express');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, MinijobSetting } = require('../models');
const { validateRegistration, validateUserUpdate, validateUserSettings, handleValidationErrors } = require('../middleware/validation');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ✅ ALLE USER AUFLISTEN (nur Admin)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', role = '' } = req.query;
    
    // Query-Filter aufbauen
    const whereClause = {};
    
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (role && ['admin', 'mitarbeiter'].includes(role)) {
      whereClause.role = role;
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: users, count: total } = await User.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'email', 'name', 'role', 'isActive', 'createdAt',
        'stundenlohn', 'abrechnungStart', 'abrechnungEnde', 'lohnzettelEmail'
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    console.log(`📋 Admin ${req.user.email} hat User-Liste abgerufen (${users.length}/${total})`);

    res.json({
      success: true,
      message: 'User-Liste erfolgreich geladen',
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Laden der User:', error);
    res.status(500).json({ 
      success: false,
      error: 'User-Liste konnte nicht geladen werden',
      code: 'USER_LIST_ERROR'
    });
  }
});

// ✅ EINZELNEN USER ABRUFEN (nur Admin)
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Benutzer nicht gefunden',
        code: 'USER_NOT_FOUND'
      });
    }

    console.log(`👤 Admin ${req.user.email} hat User ${user.email} abgerufen`);

    res.json({
      success: true,
      message: 'Benutzer erfolgreich geladen',
      data: { 
        user: user.toSafeJSON() 
      }
    });
  } catch (error) {
    console.error('Fehler beim Laden des Users:', error);
    res.status(500).json({
      success: false,
      error: 'Benutzer konnte nicht geladen werden',
      code: 'USER_LOAD_ERROR'
    });
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

      // Prüfen ob User bereits existiert
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ 
          success: false,
          error: 'Email bereits registriert',
          code: 'EMAIL_EXISTS'
        });
      }

      // Rolle validieren
      if (!['admin', 'mitarbeiter'].includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Ungültige Rolle',
          code: 'INVALID_ROLE'
        });
      }

      // Neuen User erstellen
      const user = await User.create({
        email,
        password,
        name,
        role,
        isActive: true
      });

      console.log(`➕ Admin ${req.user.email} hat neuen User erstellt: ${email} (${role})`);

      res.status(201).json({
        success: true,
        message: 'Benutzer erfolgreich erstellt',
        data: { 
          user: user.toSafeJSON() 
        }
      });
    } catch (error) {
      console.error('Fehler beim Erstellen des Users:', error);
      res.status(500).json({ 
        success: false,
        error: 'Benutzer konnte nicht erstellt werden',
        code: 'USER_CREATE_ERROR'
      });
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
      const userId = req.params.id;
      const { email, name, role, isActive, password } = req.body;

      // User finden
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false,
          error: 'Benutzer nicht gefunden',
          code: 'USER_NOT_FOUND'
        });
      }

      // Email-Eindeutigkeit prüfen (falls Email geändert wird)
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(409).json({ 
            success: false,
            error: 'Email bereits vergeben',
            code: 'EMAIL_EXISTS'
          });
        }
      }

      // Update-Objekt vorbereiten
      const updateData = {};
      if (email) updateData.email = email;
      if (name) updateData.name = name;
      if (role && ['admin', 'mitarbeiter'].includes(role)) updateData.role = role;
      if (typeof isActive === 'boolean') updateData.isActive = isActive;

      // Passwort separat behandeln (falls angegeben)
      if (password && password.trim() !== '') {
        updateData.password = password;
      }

      // User aktualisieren
      await user.update(updateData);

      console.log(`✏️ Admin ${req.user.email} hat User ${user.email} bearbeitet`);

      res.json({
        success: true,
        message: 'Benutzer erfolgreich aktualisiert',
        data: { 
          user: user.toSafeJSON() 
        }
      });
    } catch (error) {
      console.error('Fehler beim Bearbeiten des Users:', error);
      res.status(500).json({ 
        success: false,
        error: 'Benutzer konnte nicht aktualisiert werden',
        code: 'USER_UPDATE_ERROR'
      });
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
      const userId = req.params.id;
      const { stundenlohn, abrechnungStart, abrechnungEnde, lohnzettelEmail } = req.body;

      // User finden
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false,
          error: 'Benutzer nicht gefunden',
          code: 'USER_NOT_FOUND'
        });
      }

      // Update-Objekt vorbereiten
      const updateData = {};
      if (stundenlohn !== undefined) updateData.stundenlohn = parseFloat(stundenlohn);
      if (abrechnungStart !== undefined) updateData.abrechnungStart = parseInt(abrechnungStart);
      if (abrechnungEnde !== undefined) updateData.abrechnungEnde = parseInt(abrechnungEnde);
      if (lohnzettelEmail !== undefined) updateData.lohnzettelEmail = lohnzettelEmail || null;

      // User-Einstellungen aktualisieren
      await user.update(updateData);

      console.log(`⚙️ Admin ${req.user.email} hat Einstellungen für ${user.email} aktualisiert`);

      res.json({
        success: true,
        message: 'Einstellungen erfolgreich aktualisiert',
        data: { 
          user: user.toSafeJSON() 
        }
      });
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Einstellungen:', error);
      res.status(500).json({ 
        success: false,
        error: 'Einstellungen konnten nicht aktualisiert werden',
        code: 'USER_SETTINGS_ERROR'
      });
    }
  }
);

// ✅ USER DEAKTIVIEREN/AKTIVIEREN (nur Admin)
router.patch('/users/:id/toggle-status', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Sich selbst nicht deaktivieren
    if (parseInt(userId) === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: 'Sie können sich nicht selbst deaktivieren',
        code: 'CANNOT_DEACTIVATE_SELF'
      });
    }

    // User finden
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Benutzer nicht gefunden',
        code: 'USER_NOT_FOUND'
      });
    }

    // Status umschalten
    const newStatus = !user.isActive;
    await user.update({ isActive: newStatus });

    console.log(`🔄 Admin ${req.user.email} hat User ${user.email} ${newStatus ? 'aktiviert' : 'deaktiviert'}`);

    res.json({
      success: true,
      message: `Benutzer erfolgreich ${newStatus ? 'aktiviert' : 'deaktiviert'}`,
      data: { 
        user: user.toSafeJSON() 
      }
    });
  } catch (error) {
    console.error('Fehler beim Ändern des User-Status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Status konnte nicht geändert werden',
      code: 'USER_STATUS_ERROR'
    });
  }
});

// ✅ USER LÖSCHEN (nur Admin) - VORSICHT!
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Sich selbst nicht löschen
    if (parseInt(userId) === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: 'Sie können sich nicht selbst löschen',
        code: 'CANNOT_DELETE_SELF'
      });
    }

    // User finden
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Benutzer nicht gefunden',
        code: 'USER_NOT_FOUND'
      });
    }

    // Prüfen ob User noch Minijob-Settings erstellt hat
    const minijobCount = await MinijobSetting.count({ where: { createdBy: userId } });
    if (minijobCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Benutzer kann nicht gelöscht werden - hat ${minijobCount} Minijob-Einstellung(en) erstellt`,
        code: 'USER_HAS_DEPENDENCIES'
      });
    }

    const userName = user.name;
    const userEmail = user.email;

    // User löschen
    await user.destroy();

    console.log(`🗑️ Admin ${req.user.email} hat User ${userEmail} (${userName}) gelöscht`);

    res.json({
      success: true,
      message: 'Benutzer erfolgreich gelöscht',
      data: { 
        deletedUser: { 
          name: userName, 
          email: userEmail 
        } 
      }
    });
  } catch (error) {
    console.error('Fehler beim Löschen des Users:', error);
    res.status(500).json({ 
      success: false,
      error: 'Benutzer konnte nicht gelöscht werden',
      code: 'USER_DELETE_ERROR'
    });
  }
});

// ✅ USER-STATISTIKEN (nur Admin)
router.get('/stats/users', requireAdmin, async (req, res) => {
  try {
    const stats = await User.findAll({
      attributes: [
        'role',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        [require('sequelize').fn('COUNT', require('sequelize').literal('CASE WHEN isActive = 1 THEN 1 END')), 'activeCount']
      ],
      group: 'role'
    });

    const totalCount = await User.count();
    const activeCount = await User.count({ where: { isActive: true } });

    console.log(`📊 Admin ${req.user.email} hat User-Statistiken abgerufen`);

    res.json({
      success: true,
      message: 'User-Statistiken erfolgreich geladen',
      data: {
        total: totalCount,
        active: activeCount,
        inactive: totalCount - activeCount,
        byRole: stats.map(stat => ({
          role: stat.role,
          total: parseInt(stat.dataValues.count),
          active: parseInt(stat.dataValues.activeCount || 0)
        }))
      }
    });
  } catch (error) {
    console.error('Fehler beim Laden der User-Statistiken:', error);
    res.status(500).json({
      success: false,
      error: 'User-Statistiken konnten nicht geladen werden',
      code: 'USER_STATS_ERROR'
    });
  }
});

// ✅ ERSTEN ADMIN ERSTELLEN (Temporäre Route)
router.get('/create-first-admin', async (req, res) => {
  try {
    // Prüfen ob bereits ein Admin existiert
    const existingAdmin = await User.findOne({ where: { role: 'admin' } });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Admin bereits vorhanden',
        code: 'ADMIN_EXISTS',
        data: {
          existingAdmin: {
            email: existingAdmin.email,
            name: existingAdmin.name,
            role: existingAdmin.role
          }
        }
      });
    }

    // Ersten Admin erstellen
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
        loginDaten: {
          email: 'admin@schoppmann.de',
          passwort: 'Admin123!'
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Admins:', error);
    res.status(500).json({ 
      success: false,
      error: 'Admin konnte nicht erstellt werden',
      code: 'ADMIN_CREATE_ERROR'
    });
  }
});

// ✅ DATABASE RESET (nur Admin) - VORSICHT!
router.post('/reset-database', requireAdmin, async (req, res) => {
  try {
    console.log(`🔄 Admin ${req.user.email} startet Database Reset...`);

    // 1. Alle Minijob-Einstellungen löschen
    await MinijobSetting.destroy({ where: {} });
    console.log('✅ Alle Minijob-Einstellungen gelöscht');

    // 2. Alle User außer dem aktuellen Admin löschen
    await User.destroy({
      where: {
        id: { [Op.ne]: req.user.userId }
      }
    });
    console.log('✅ Alle User außer aktuellem Admin gelöscht');

    // 3. Aktuellen Admin auf Standard-Werte zurücksetzen (optional)
    const currentAdmin = await User.findByPk(req.user.userId);
    if (currentAdmin) {
      await currentAdmin.update({
        stundenlohn: 12.00,
        abrechnungStart: 1,
        abrechnungEnde: 31,
        lohnzettelEmail: null
      });
      console.log('✅ Admin-Einstellungen auf Standard zurückgesetzt');
    }

    // 4. Standard Minijob-Einstellung erstellen
    const standardMinijobSetting = await MinijobSetting.create({
      monthlyLimit: 538.00,
      description: 'Standard Minijob-Grenze (Stand 2024)',
      validFrom: '2024-01-01',
      validUntil: null,
      createdBy: req.user.userId
    });
    console.log('✅ Standard Minijob-Einstellung erstellt');

    // 5. Aktive Einstellungen aktualisieren
    await MinijobSetting.updateActiveStatus();

    console.log(`🎉 Database Reset abgeschlossen von Admin ${req.user.email}`);

    res.json({
      success: true,
      message: 'Datenbank erfolgreich zurückgesetzt',
      data: {
        adminBeibehalten: {
          id: currentAdmin?.id,
          email: currentAdmin?.email,
          name: currentAdmin?.name
        },
        standardMinijobSetting: {
          limit: standardMinijobSetting.monthlyLimit,
          description: standardMinijobSetting.description
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Fehler beim Database Reset:', error);
    res.status(500).json({
      success: false,
      error: 'Database Reset fehlgeschlagen',
      code: 'DATABASE_RESET_ERROR',
      details: error.message
    });
  }
});

// ✅ SICHERE DATABASE RESET ROUTE MIT BESTÄTIGUNG
router.post('/reset-database-confirm', requireAdmin, async (req, res) => {
  const { confirmation } = req.body;

  // Sicherheitsbestätigung erforderlich
  if (confirmation !== 'RESET_ALL_DATA_CONFIRM') {
    return res.status(400).json({
      success: false,
      error: 'Bestätigung erforderlich',
      code: 'CONFIRMATION_REQUIRED',
      data: {
        requiredConfirmation: 'RESET_ALL_DATA_CONFIRM'
      }
    });
  }

  try {
    console.log(`🔄 BESTÄTIGTER Database Reset von Admin ${req.user.email}`);

    // Alle Tabellen leeren
    await MinijobSetting.destroy({ where: {} });
    await User.destroy({ where: {} });

    // Neuen Admin erstellen
    const newAdmin = await User.create({
      email: 'admin@schoppmann.de',
      password: 'Admin123!',
      name: 'Administrator',
      role: 'admin',
      isActive: true
    });

    // Standard Minijob-Einstellung
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
      data: {
        newAdminCredentials: {
          email: 'admin@schoppmann.de',
          password: 'Admin123!'
        }
      }
    });
  } catch (error) {
    console.error('❌ Fehler beim kompletten Reset:', error);
    res.status(500).json({ 
      success: false,
      error: 'Reset fehlgeschlagen',
      code: 'COMPLETE_RESET_ERROR'
    });
  }
});

module.exports = router;