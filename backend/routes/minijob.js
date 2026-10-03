/**
 * Minijob-Grenzen (/admin/minijob) – nur für Admins.
 *
 * Dünne Controller-Schicht über MinijobService (Überschneidungsprüfung, automatische Anpassung der
 * Vorgänger-Grenze, Neuberechnung). Jede Änderung steht im Änderungsprotokoll.
 */
const { createApiRouter } = require('../lib/route');
const { AppError } = require('../lib/errors');
const MinijobService = require('../services/minijobService');
const { actorOf } = require('../middleware/auth');
const { idParam } = require('../schemas/common');
const {
  MinijobSettingBody, MinijobListQuery, SettingListData, SettingData, CreateSettingData, DeleteSettingData,
  RecalculateData, RefreshStatusData, MinijobStats
} = require('../schemas/minijob');

const api = createApiRouter('/admin/minijob', { tags: ['Minijob-Grenzen'] });

const SettingIdParam = idParam('id', 'Einstellungs-ID');

api.get('/settings', {
  summary: 'Alle Minijob-Grenzen',
  auth: 'admin',
  query: MinijobListQuery,
  response: SettingListData,
  message: 'Minijob-Einstellungen erfolgreich geladen'
}, async (req) => {
  const { page = 1, limit = 20, status = '' } = req.valid.query;
  // Aktiv-Kennzeichen vor dem Lesen aktualisieren
  await MinijobService.updateActiveStatus();
  return { data: await MinijobService.getAllSettings({ page, limit, status }) };
});

api.get('/settings/current', {
  summary: 'Heute gültige Minijob-Grenze',
  auth: 'admin',
  response: SettingData,
  message: 'Aktuelle Minijob-Einstellung gefunden',
  errors: ['NO_CURRENT_SETTING']
}, async () => {
  const setting = await MinijobService.getCurrentSetting();
  if (!setting) {
    throw new AppError('NO_CURRENT_SETTING', 'Keine aktuelle Minijob-Einstellung gefunden', {
      extra: { data: { suggestion: 'Bitte erstellen Sie eine neue Einstellung' } }
    });
  }
  return { data: { setting } };
});

api.post('/settings', {
  summary: 'Minijob-Grenze anlegen',
  description: 'Eine unbefristete Vorgänger-Grenze wird automatisch zum Vortag beendet. Rückwirkender Beginn ist erlaubt; ' +
    'abgeschlossene Perioden behalten ihre eingefrorene Grenze.',
  auth: 'admin',
  body: MinijobSettingBody,
  response: CreateSettingData,
  status: 201,
  errors: ['OVERLAPPING_PERIODS']
}, async (req) => {
  const { setting, autoAdjustedSettings } = await MinijobService.createSetting(req.valid.body, req.user.userId, actorOf(req));
  return {
    message: autoAdjustedSettings.length > 0
      ? 'Minijob-Einstellung erfolgreich erstellt. Vorherige Einstellung wurde automatisch angepasst.'
      : 'Minijob-Einstellung erfolgreich erstellt',
    data: { setting, autoAdjustedSettings }
  };
});

api.put('/settings/:id', {
  summary: 'Minijob-Grenze ändern',
  auth: 'admin',
  params: SettingIdParam,
  body: MinijobSettingBody,
  response: SettingData,
  message: 'Minijob-Einstellung erfolgreich aktualisiert',
  errors: ['SETTING_NOT_FOUND']
}, async (req) => {
  const setting = await MinijobService.updateSetting(req.valid.params.id, req.valid.body, actorOf(req));
  return { data: { setting } };
});

api.delete('/settings/:id', {
  summary: 'Künftige Minijob-Grenze löschen',
  auth: 'admin',
  params: SettingIdParam,
  response: DeleteSettingData,
  errors: ['SETTING_NOT_FOUND', 'CANNOT_DELETE_ACTIVE']
}, async (req) => {
  const { deletedSetting, adjustedSettings } = await MinijobService.deleteSetting(req.valid.params.id, actorOf(req));
  return {
    message: adjustedSettings.length > 0
      ? 'Minijob-Einstellung erfolgreich gelöscht. Vorherige Einstellung wurde automatisch angepasst.'
      : 'Minijob-Einstellung erfolgreich gelöscht',
    data: { deletedSetting, adjustedSettings }
  };
});

api.post('/settings/recalculate-periods', {
  summary: 'Gültigkeitszeiträume lückenlos neu berechnen',
  auth: 'admin',
  response: RecalculateData
}, async (req) => {
  const { adjustedCount, adjustments } = await MinijobService.recalculateAllPeriods(actorOf(req));
  return {
    message: `Zeiträume erfolgreich neu berechnet - ${adjustedCount} Anpassungen vorgenommen`,
    data: { adjustedCount, adjustments }
  };
});

api.post('/settings/refresh-status', {
  summary: 'Aktiv-Kennzeichen neu setzen',
  auth: 'admin',
  response: RefreshStatusData,
  message: 'Minijob-Status erfolgreich aktualisiert'
}, async () => ({ data: { currentSetting: await MinijobService.updateActiveStatus() } }));

api.get('/stats', {
  summary: 'Kennzahlen zu Minijob-Grenzen',
  auth: 'admin',
  response: MinijobStats,
  message: 'Minijob-Statistiken erfolgreich geladen'
}, async () => ({ data: await MinijobService.getStatistics() }));

module.exports = api.router;
