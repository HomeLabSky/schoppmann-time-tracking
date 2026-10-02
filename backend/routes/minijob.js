/**
 * Minijob-Routen (/api/admin/minijob) – nur für Admins.
 *
 * Dünne Controller-Schicht über MinijobService. Die gesamte Fachlogik
 * (Überschneidungsprüfung, automatische Zeitraum-Anpassung, Neuberechnung)
 * liegt im Service. Antwortformate folgen dem Vertrag.
 */
const express = require('express');
const MinijobService = require('../services/minijobService');
const { validateMinijobSetting, handleValidationErrors } = require('../middleware/validation');
const { requireAdmin } = require('../middleware/auth');
const { sendServiceError } = require('../utils/serviceErrors');

const router = express.Router();

// Auslöser für das Änderungsprotokoll
const actorOf = (req) => ({ id: req.user.userId, email: req.user.email });

// express-validator wandelt Datumsfelder per `.toDate()` in Date-Objekte um;
// der Service erwartet YYYY-MM-DD-Strings → hier normalisieren.
const toDateString = (value) =>
  value instanceof Date ? value.toISOString().split('T')[0] : value;

const normalizeSettingBody = (body) => ({
  ...body,
  validFrom: toDateString(body.validFrom),
  validUntil: body.validUntil != null ? toDateString(body.validUntil) : null
});

// ✅ ALLE MINIJOB-EINSTELLUNGEN ABRUFEN (nur Admin)
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '' } = req.query;
    // Aktiv-Status vor dem Lesen aktualisieren, damit isActive korrekt ist.
    await MinijobService.updateActiveStatus();
    const result = await MinijobService.getAllSettings({ page, limit, status });

    console.log(`📋 Admin ${req.user.email} hat Minijob-Einstellungen abgerufen (${result.settings.length}/${result.pagination.total})`);
    res.json({ success: true, message: 'Minijob-Einstellungen erfolgreich geladen', data: result });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'MINIJOB_SETTINGS_ERROR', error: 'Minijob-Einstellungen konnten nicht geladen werden' });
  }
});

// ✅ AKTUELLE MINIJOB-EINSTELLUNG ABRUFEN (nur Admin)
router.get('/settings/current', requireAdmin, async (req, res) => {
  try {
    const currentSetting = await MinijobService.getCurrentSetting();

    if (!currentSetting) {
      return res.status(404).json({
        success: false,
        error: 'Keine aktuelle Minijob-Einstellung gefunden',
        code: 'NO_CURRENT_SETTING',
        data: { suggestion: 'Bitte erstellen Sie eine neue Einstellung' }
      });
    }

    console.log(`📊 Admin ${req.user.email} hat aktuelle Minijob-Einstellung abgerufen`);
    res.json({ success: true, message: 'Aktuelle Minijob-Einstellung gefunden', data: { setting: currentSetting } });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'CURRENT_SETTING_ERROR', error: 'Aktuelle Minijob-Einstellung konnte nicht geladen werden' });
  }
});

// ✅ NEUE MINIJOB-EINSTELLUNG ERSTELLEN (nur Admin)
router.post('/settings',
  requireAdmin,
  ...validateMinijobSetting,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { setting, autoAdjustedSettings } = await MinijobService.createSetting(
        normalizeSettingBody(req.body),
        req.user.userId,
        actorOf(req)
      );

      console.log(`➕ Admin ${req.user.email} hat neue Minijob-Einstellung erstellt: ${setting.monthlyLimit}€ ab ${setting.validFrom}`);

      const message = autoAdjustedSettings.length > 0
        ? 'Minijob-Einstellung erfolgreich erstellt. Vorherige Einstellung wurde automatisch angepasst.'
        : 'Minijob-Einstellung erfolgreich erstellt';

      res.status(201).json({ success: true, message, data: { setting, autoAdjustedSettings } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'MINIJOB_CREATE_ERROR', error: 'Minijob-Einstellung konnte nicht erstellt werden' });
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
      const setting = await MinijobService.updateSetting(req.params.id, normalizeSettingBody(req.body), actorOf(req));

      console.log(`✏️ Admin ${req.user.email} hat Minijob-Einstellung ${req.params.id} bearbeitet`);
      res.json({ success: true, message: 'Minijob-Einstellung erfolgreich aktualisiert', data: { setting } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'MINIJOB_UPDATE_ERROR', error: 'Minijob-Einstellung konnte nicht aktualisiert werden' });
    }
  }
);

// ✅ MINIJOB-EINSTELLUNG LÖSCHEN (nur Admin)
router.delete('/settings/:id', requireAdmin, async (req, res) => {
  try {
    const { deletedSetting, adjustedSettings } = await MinijobService.deleteSetting(req.params.id, actorOf(req));

    console.log(`🗑️ Admin ${req.user.email} hat Minijob-Einstellung ${req.params.id} gelöscht`);

    const message = adjustedSettings.length > 0
      ? 'Minijob-Einstellung erfolgreich gelöscht. Vorherige Einstellung wurde automatisch angepasst.'
      : 'Minijob-Einstellung erfolgreich gelöscht';

    res.json({ success: true, message, data: { deletedSetting, adjustedSettings } });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'MINIJOB_DELETE_ERROR', error: 'Minijob-Einstellung konnte nicht gelöscht werden' });
  }
});

// ✅ ALLE MINIJOB-ZEITRÄUME NEU BERECHNEN (nur Admin)
router.post('/settings/recalculate-periods', requireAdmin, async (req, res) => {
  try {
    const { adjustedCount, adjustments } = await MinijobService.recalculateAllPeriods(actorOf(req));

    console.log(`✅ Admin ${req.user.email} – Neuberechnung abgeschlossen: ${adjustedCount} Anpassungen`);
    res.json({
      success: true,
      message: `Zeiträume erfolgreich neu berechnet - ${adjustedCount} Anpassungen vorgenommen`,
      data: { adjustedCount, adjustments }
    });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'RECALCULATION_ERROR', error: 'Neuberechnung fehlgeschlagen' });
  }
});

// ✅ MINIJOB-STATUS MANUELL AKTUALISIEREN (nur Admin)
router.post('/settings/refresh-status', requireAdmin, async (req, res) => {
  try {
    const currentSetting = await MinijobService.updateActiveStatus();

    console.log(`🔄 Admin ${req.user.email} hat Minijob-Status manuell aktualisiert`);
    res.json({ success: true, message: 'Minijob-Status erfolgreich aktualisiert', data: { currentSetting } });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'STATUS_REFRESH_ERROR', error: 'Minijob-Status konnte nicht aktualisiert werden' });
  }
});

// ✅ MINIJOB-STATISTIKEN (nur Admin)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await MinijobService.getStatistics();

    console.log(`📊 Admin ${req.user.email} hat Minijob-Statistiken abgerufen`);
    res.json({ success: true, message: 'Minijob-Statistiken erfolgreich geladen', data: stats });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'MINIJOB_STATS_ERROR', error: 'Minijob-Statistiken konnten nicht geladen werden' });
  }
});

module.exports = router;
