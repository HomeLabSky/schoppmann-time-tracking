const express = require('express');
const { Op } = require('sequelize');
const { User, MinijobSetting, sequelize } = require('../models');
const { validateMinijobSetting, handleValidationErrors } = require('../middleware/validation');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ✅ Helper-Funktion: Sichere Datums-Berechnung
const getDateBefore = (dateString) => {
  const date = new Date(dateString + 'T00:00:00.000Z'); // UTC um Zeitzone-Probleme zu vermeiden
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
};

// ✅ ALLE MINIJOB-EINSTELLUNGEN ABRUFEN (nur Admin)
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '' } = req.query;
    
    // Query-Filter aufbauen
    const whereClause = {};
    
    if (status === 'active') {
      whereClause.isActive = true;
    } else if (status === 'inactive') {
      whereClause.isActive = false;
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: settings, count: total } = await MinijobSetting.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'Creator',
        attributes: ['name', 'email']
      }],
      order: [['validFrom', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    // Aktive Einstellungen aktualisieren
    await MinijobSetting.updateActiveStatus();

    console.log(`📋 Admin ${req.user.email} hat Minijob-Einstellungen abgerufen (${settings.length}/${total})`);

    res.json({
      success: true,
      message: 'Minijob-Einstellungen erfolgreich geladen',
      data: {
        settings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Fehler beim Laden der Minijob-Einstellungen:', error);
    res.status(500).json({ 
      success: false,
      error: 'Minijob-Einstellungen konnten nicht geladen werden',
      code: 'MINIJOB_SETTINGS_ERROR'
    });
  }
});

// ✅ AKTUELLE MINIJOB-EINSTELLUNG ABRUFEN (nur Admin)
router.get('/settings/current', requireAdmin, async (req, res) => {
  try {
    const currentSetting = await MinijobSetting.getCurrentSetting();

    if (!currentSetting) {
      return res.status(404).json({
        success: false,
        error: 'Keine aktuelle Minijob-Einstellung gefunden',
        code: 'NO_CURRENT_SETTING',
        data: {
          suggestion: 'Bitte erstellen Sie eine neue Einstellung'
        }
      });
    }

    console.log(`📊 Admin ${req.user.email} hat aktuelle Minijob-Einstellung abgerufen`);

    res.json({
      success: true,
      message: 'Aktuelle Minijob-Einstellung gefunden',
      data: { 
        setting: currentSetting 
      }
    });
  } catch (error) {
    console.error('Fehler beim Laden der aktuellen Minijob-Einstellung:', error);
    res.status(500).json({ 
      success: false,
      error: 'Aktuelle Minijob-Einstellung konnte nicht geladen werden',
      code: 'CURRENT_SETTING_ERROR'
    });
  }
});

// ✅ NEUE MINIJOB-EINSTELLUNG ERSTELLEN (nur Admin)
router.post('/settings', 
  requireAdmin,
  ...validateMinijobSetting,
  handleValidationErrors,
  async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { monthlyLimit, description, validFrom, validUntil } = req.body;

      // Datum-Validierung
      const today = new Date().toISOString().split('T')[0];
      const fromDate = new Date(validFrom).toISOString().split('T')[0];

      if (fromDate < today) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: 'Das Startdatum darf nicht in der Vergangenheit liegen',
          code: 'INVALID_START_DATE'
        });
      }

      if (validUntil) {
        const untilDate = new Date(validUntil).toISOString().split('T')[0];
        if (untilDate <= fromDate) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            error: 'Das Enddatum muss nach dem Startdatum liegen',
            code: 'INVALID_END_DATE'
          });
        }
      }

      // Überschneidungsprüfung
      const overlappingSettings = await MinijobSetting.findAll({
        where: {
          [Op.or]: [
            // Neue Einstellung startet innerhalb einer bestehenden
            {
              validFrom: { [Op.lte]: fromDate },
              [Op.or]: [
                { validUntil: null },
                { validUntil: { [Op.gte]: fromDate } }
              ]
            },
            // Weitere Prüfungen
            validUntil ? {
              validFrom: { [Op.lte]: validUntil },
              [Op.or]: [
                { validUntil: null },
                { validUntil: { [Op.gte]: validUntil } }
              ]
            } : {},
            validUntil ? {
              validFrom: { [Op.gte]: fromDate },
              validUntil: { [Op.lte]: validUntil }
            } : {}
          ]
        },
        transaction
      });

      let autoAdjustedSettings = [];

      if (overlappingSettings.length > 0) {
        const previousUnlimitedSetting = overlappingSettings.find(s =>
          s.validUntil === null && s.validFrom < fromDate
        );

        if (overlappingSettings.length === 1 && previousUnlimitedSetting) {
          // Sichere Datums-Berechnung
          const newEndDate = getDateBefore(fromDate);

          await previousUnlimitedSetting.update({
            validUntil: newEndDate
          }, { transaction });

          autoAdjustedSettings.push({
            id: previousUnlimitedSetting.id,
            description: previousUnlimitedSetting.description,
            oldValidUntil: 'unbegrenzt',
            newValidUntil: newEndDate
          });

          console.log(`🔄 Automatische Anpassung: Einstellung ${previousUnlimitedSetting.id} endet jetzt am ${newEndDate}`);
        } else {
          await transaction.rollback();
          return res.status(409).json({
            success: false,
            error: 'Zeitraum überschneidet sich mit bestehenden Einstellungen',
            code: 'OVERLAPPING_PERIODS',
            data: {
              suggestion: 'Bitte überprüfen Sie die bestehenden Einstellungen und passen Sie diese gegebenenfalls an',
              conflictingSettings: overlappingSettings.map(s => ({
                id: s.id,
                validFrom: s.validFrom,
                validUntil: s.validUntil,
                description: s.description,
                monthlyLimit: s.monthlyLimit
              }))
            }
          });
        }
      }

      // Neue Einstellung erstellen
      const newSetting = await MinijobSetting.create({
        monthlyLimit: parseFloat(monthlyLimit),
        description,
        validFrom: fromDate,
        validUntil: validUntil ? new Date(validUntil).toISOString().split('T')[0] : null,
        createdBy: req.user.userId
      }, { transaction });

      // Transaktion committen
      await transaction.commit();

      // Aktive Einstellungen aktualisieren
      await MinijobSetting.updateActiveStatus();

      console.log(`➕ Admin ${req.user.email} hat neue Minijob-Einstellung erstellt: ${monthlyLimit}€ ab ${fromDate}`);

      const responseMessage = autoAdjustedSettings.length > 0
        ? `Minijob-Einstellung erfolgreich erstellt. Vorherige Einstellung wurde automatisch angepasst.`
        : 'Minijob-Einstellung erfolgreich erstellt';

      res.status(201).json({
        success: true,
        message: responseMessage,
        data: { 
          setting: newSetting,
          autoAdjustedSettings: autoAdjustedSettings
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Fehler beim Erstellen der Minijob-Einstellung:', error);
      res.status(500).json({ 
        success: false,
        error: 'Minijob-Einstellung konnte nicht erstellt werden',
        code: 'MINIJOB_CREATE_ERROR'
      });
    }
  }
);

// ✅ MINIJOB-EINSTELLUNG BEARBEITEN (nur Admin)
router.put('/settings/:id', 
  requireAdmin,
  ...validateMinijobSetting,
  handleValidationErrors,
  async (req, res) => {
    try {
      const settingId = req.params.id;
      const { monthlyLimit, description, validFrom, validUntil } = req.body;

      const setting = await MinijobSetting.findByPk(settingId);
      if (!setting) {
        return res.status(404).json({ 
          success: false,
          error: 'Minijob-Einstellung nicht gefunden',
          code: 'SETTING_NOT_FOUND'
        });
      }

      // Datum-Validierung
      const fromDate = new Date(validFrom).toISOString().split('T')[0];

      if (validUntil) {
        const untilDate = new Date(validUntil).toISOString().split('T')[0];
        if (untilDate <= fromDate) {
          return res.status(400).json({
            success: false,
            error: 'Das Enddatum muss nach dem Startdatum liegen',
            code: 'INVALID_END_DATE'
          });
        }
      }

      // Aktualisieren
      await setting.update({
        monthlyLimit: parseFloat(monthlyLimit),
        description,
        validFrom: fromDate,
        validUntil: validUntil ? new Date(validUntil).toISOString().split('T')[0] : null
      });

      // Aktive Einstellungen aktualisieren
      await MinijobSetting.updateActiveStatus();

      console.log(`✏️ Admin ${req.user.email} hat Minijob-Einstellung ${settingId} bearbeitet`);

      res.json({
        success: true,
        message: 'Minijob-Einstellung erfolgreich aktualisiert',
        data: { 
          setting 
        }
      });
    } catch (error) {
      console.error('Fehler beim Bearbeiten der Minijob-Einstellung:', error);
      res.status(500).json({ 
        success: false,
        error: 'Minijob-Einstellung konnte nicht aktualisiert werden',
        code: 'MINIJOB_UPDATE_ERROR'
      });
    }
  }
);

// ✅ MINIJOB-EINSTELLUNG LÖSCHEN (nur Admin)
router.delete('/settings/:id', requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const settingId = req.params.id;
    const today = new Date().toISOString().split('T')[0];

    const settingToDelete = await MinijobSetting.findByPk(settingId, { transaction });
    if (!settingToDelete) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        error: 'Minijob-Einstellung nicht gefunden',
        code: 'SETTING_NOT_FOUND'
      });
    }

    // Nur zukünftige Einstellungen dürfen gelöscht werden
    if (settingToDelete.validFrom <= today) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Aktive oder vergangene Einstellungen können nicht gelöscht werden',
        code: 'CANNOT_DELETE_ACTIVE',
        data: {
          suggestion: 'Bearbeiten Sie die Einstellung oder erstellen Sie eine neue'
        }
      });
    }

    let adjustedSettings = [];

    // Nachfolgende Einstellungen finden
    const laterSettings = await MinijobSetting.findAll({
      where: {
        validFrom: { [Op.gt]: settingToDelete.validFrom },
        id: { [Op.ne]: settingId }
      },
      order: [['validFrom', 'ASC']],
      transaction
    });

    // Vorherige Einstellung finden
    const previousSetting = await MinijobSetting.findOne({
      where: {
        validFrom: { [Op.lt]: settingToDelete.validFrom },
        id: { [Op.ne]: settingId }
      },
      order: [['validFrom', 'DESC']],
      transaction
    });

    // Intelligente Anpassung der vorherigen Einstellung
    if (previousSetting) {
      let newValidUntil = null; // Standard: unbegrenzt
      let adjustmentReason = 'unbegrenzt (keine weitere Einstellung)';

      // Wenn es weitere Einstellungen NACH der zu löschenden gibt
      if (laterSettings.length > 0) {
        const nextSetting = laterSettings[0];
        newValidUntil = getDateBefore(nextSetting.validFrom);
        adjustmentReason = `bis ${newValidUntil} (wegen nachfolgender Einstellung)`;
      }

      // Vorherige Einstellung anpassen
      const oldValidUntil = previousSetting.validUntil;
      await previousSetting.update({ validUntil: newValidUntil }, { transaction });

      adjustedSettings.push({
        id: previousSetting.id,
        description: previousSetting.description,
        oldValidUntil: oldValidUntil || 'unbegrenzt',
        newValidUntil: newValidUntil || 'unbegrenzt',
        reason: adjustmentReason
      });

      console.log(`🔄 Rückwärts-Anpassung: Einstellung ${previousSetting.id} von "${oldValidUntil || 'unbegrenzt'}" auf "${newValidUntil || 'unbegrenzt'}" geändert`);
    }

    // Die gewählte Einstellung löschen
    await settingToDelete.destroy({ transaction });

    // Transaktion committen
    await transaction.commit();

    // Aktive Einstellungen aktualisieren
    await MinijobSetting.updateActiveStatus();

    console.log(`🗑️ Admin ${req.user.email} hat Minijob-Einstellung ${settingId} gelöscht`);

    const responseMessage = adjustedSettings.length > 0
      ? `Minijob-Einstellung erfolgreich gelöscht. Vorherige Einstellung wurde automatisch angepasst.`
      : 'Minijob-Einstellung erfolgreich gelöscht';

    res.json({
      success: true,
      message: responseMessage,
      data: {
        deletedSetting: {
          id: settingToDelete.id,
          description: settingToDelete.description,
          validFrom: settingToDelete.validFrom,
          validUntil: settingToDelete.validUntil
        },
        adjustedSettings: adjustedSettings
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Fehler beim Löschen der Minijob-Einstellung:', error);
    res.status(500).json({ 
      success: false,
      error: 'Minijob-Einstellung konnte nicht gelöscht werden',
      code: 'MINIJOB_DELETE_ERROR'
    });
  }
});

// ✅ ALLE MINIJOB-ZEITRÄUME NEU BERECHNEN (nur Admin)
router.post('/settings/recalculate-periods', requireAdmin, async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    console.log(`🔄 Admin ${req.user.email} startet Neuberechnung aller Minijob-Zeiträume`);

    // Alle Einstellungen chronologisch abrufen
    const allSettings = await MinijobSetting.findAll({
      order: [['validFrom', 'ASC']],
      transaction
    });

    let adjustedCount = 0;
    const adjustments = [];

    // Durch alle Einstellungen iterieren und Zeiträume korrigieren
    for (let i = 0; i < allSettings.length; i++) {
      const currentSetting = allSettings[i];
      const nextSetting = allSettings[i + 1];

      let newValidUntil = null; // Standard: unbegrenzt

      if (nextSetting) {
        // Sichere Datums-Berechnung
        newValidUntil = getDateBefore(nextSetting.validFrom);
      }

      // Nur aktualisieren wenn sich etwas geändert hat
      const oldValidUntil = currentSetting.validUntil;
      const hasChanged = (oldValidUntil === null && newValidUntil !== null) ||
        (oldValidUntil !== null && newValidUntil === null) ||
        (oldValidUntil !== newValidUntil);

      if (hasChanged) {
        await currentSetting.update({ validUntil: newValidUntil }, { transaction });
        adjustedCount++;

        adjustments.push({
          id: currentSetting.id,
          description: currentSetting.description,
          validFrom: currentSetting.validFrom,
          oldValidUntil: oldValidUntil || 'unbegrenzt',
          newValidUntil: newValidUntil || 'unbegrenzt'
        });
      }
    }

    // Transaktion committen
    await transaction.commit();

    // Aktive Einstellungen aktualisieren
    await MinijobSetting.updateActiveStatus();

    console.log(`✅ Neuberechnung abgeschlossen: ${adjustedCount} Einstellungen angepasst`);

    res.json({
      success: true,
      message: `Zeiträume erfolgreich neu berechnet - ${adjustedCount} Anpassungen vorgenommen`,
      data: {
        adjustedCount: adjustedCount,
        adjustments: adjustments
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Fehler bei der Neuberechnung:', error);
    res.status(500).json({ 
      success: false,
      error: 'Neuberechnung fehlgeschlagen',
      code: 'RECALCULATION_ERROR'
    });
  }
});

// ✅ MINIJOB-STATUS MANUELL AKTUALISIEREN (nur Admin)
router.post('/settings/refresh-status', requireAdmin, async (req, res) => {
  try {
    const currentSetting = await MinijobSetting.updateActiveStatus();

    console.log(`🔄 Admin ${req.user.email} hat Minijob-Status manuell aktualisiert`);

    res.json({
      success: true,
      message: 'Minijob-Status erfolgreich aktualisiert',
      data: { 
        currentSetting 
      }
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Minijob-Status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Minijob-Status konnte nicht aktualisiert werden',
      code: 'STATUS_REFRESH_ERROR'
    });
  }
});

// ✅ MINIJOB-STATISTIKEN (nur Admin)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const totalSettings = await MinijobSetting.count();
    const activeSettings = await MinijobSetting.count({ where: { isActive: true } });
    const currentSetting = await MinijobSetting.getCurrentSetting();

    // Statistiken der letzten 12 Monate
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const recentSettings = await MinijobSetting.findAll({
      where: {
        createdAt: { [Op.gte]: oneYearAgo }
      },
      order: [['createdAt', 'DESC']],
      limit: 10,
      include: [{
        model: User,
        as: 'Creator',
        attributes: ['name', 'email']
      }]
    });

    console.log(`📊 Admin ${req.user.email} hat Minijob-Statistiken abgerufen`);

    res.json({
      success: true,
      message: 'Minijob-Statistiken erfolgreich geladen',
      data: {
        overview: {
          total: totalSettings,
          active: activeSettings,
          inactive: totalSettings - activeSettings,
          currentLimit: currentSetting ? currentSetting.monthlyLimit : null
        },
        current: currentSetting,
        recent: recentSettings
      }
    });
  } catch (error) {
    console.error('Fehler beim Laden der Minijob-Statistiken:', error);
    res.status(500).json({
      success: false,
      error: 'Minijob-Statistiken konnten nicht geladen werden',
      code: 'MINIJOB_STATS_ERROR'
    });
  }
});

module.exports = router;