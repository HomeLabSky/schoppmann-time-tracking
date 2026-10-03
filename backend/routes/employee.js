/**
 * Selbstbedienung (/employee) für angemeldete Mitarbeiter und Admins.
 *
 * Dünne Controller-Schicht: Geschäftslogik im UserService; Minijob-Grenze nur lesend.
 * Lohn und Abrechnungszeitraum legt ausschließlich ein Admin fest (PUT /admin/users/:id/settings).
 */
const { MinijobSetting } = require('../models');
const { createApiRouter } = require('../lib/route');
const { AppError } = require('../lib/errors');
const UserService = require('../services/userService');
const SessionService = require('../services/sessionService');
const { clearAuthCookies } = require('../utils/authCookies');
const { actorOf } = require('../middleware/auth');
const { ProfileUpdateBody, UserData } = require('../schemas/auth');
const {
  UserSettingsBody, Settings, EmployeeChangePasswordBody, EmployeeSettingsData, MinijobLimitInfo, DashboardData, AccountStatusData
} = require('../schemas/user');
const { z } = require('../schemas/common');

const api = createApiRouter('/employee', { tags: ['Mitarbeiter'] });

/** Eigenes Konto (auch deaktiviert); wirft USER_NOT_FOUND bzw. USER_INACTIVE */
const loadSelf = async (req, { rejectInactive = true } = {}) => {
  const user = await UserService.findUserById(req.user.userId, true);
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  if (rejectInactive && !user.isActive) throw new AppError('USER_INACTIVE', 'Benutzer ist deaktiviert');
  return user;
};

const settingsOf = (user) => ({
  stundenlohn: user.stundenlohn ?? 12.0,
  abrechnungStart: user.abrechnungStart || 1,
  abrechnungEnde: user.abrechnungEnde || 31,
  lohnzettelEmail: user.lohnzettelEmail || user.email
});

const limitInfo = (setting) => ({
  monthlyLimit: setting.monthlyLimit,
  description: setting.description,
  validFrom: setting.validFrom,
  validUntil: setting.validUntil
});

api.get('/profile', {
  summary: 'Eigenes Profil',
  response: UserData,
  message: 'Profil erfolgreich geladen',
  errors: ['USER_NOT_FOUND', 'USER_INACTIVE']
}, async (req) => ({ data: { user: await loadSelf(req) } }));

api.put('/profile', {
  summary: 'Eigenes Profil ändern (Name, E-Mail)',
  body: ProfileUpdateBody,
  response: UserData,
  message: 'Profil erfolgreich aktualisiert',
  errors: ['EMAIL_EXISTS']
}, async (req) => {
  const user = await UserService.updateUserProfile(req.user.userId, req.valid.body);
  return { data: { user } };
});

api.put('/change-password', {
  summary: 'Eigenes Passwort ändern (mit Bestätigung)',
  description: 'Beendet alle anderen Sitzungen des Benutzers; die aktuelle bleibt bestehen.',
  body: EmployeeChangePasswordBody,
  message: 'Passwort erfolgreich geändert',
  errors: ['INVALID_CURRENT_PASSWORD']
}, async (req) => {
  const { currentPassword, newPassword } = req.valid.body;
  await UserService.changeUserPassword(req.user.userId, currentPassword, newPassword, undefined, req.user.sid);
  return {};
});

api.get('/settings', {
  summary: 'Eigene Arbeitseinstellungen (Lohn, Abrechnungszeitraum, Lohnzettel-E-Mail)',
  response: EmployeeSettingsData,
  message: 'Arbeitseinstellungen erfolgreich geladen'
}, async (req) => {
  const user = await loadSelf(req);
  return {
    data: {
      settings: settingsOf(user),
      userInfo: { id: user.id, name: user.name, email: user.email, role: user.role }
    }
  };
});

// Lohn und Abrechnungszeitraum legt nur ein Admin fest
const ADMIN_ONLY_SETTINGS = ['stundenlohn', 'abrechnungStart', 'abrechnungEnde'];

api.put('/settings', {
  summary: 'Eigene Lohnzettel-E-Mail ändern',
  description: 'Selbstbedienung nur für `lohnzettelEmail`. Stundenlohn oder Abrechnungszeitraum im Body → 403 SETTINGS_ADMIN_ONLY.',
  auth: 'employee',
  body: UserSettingsBody,
  response: z.object({ settings: Settings }),
  message: 'Arbeitseinstellungen erfolgreich aktualisiert',
  errors: ['SETTINGS_ADMIN_ONLY']
}, async (req) => {
  const body = req.valid.body;
  const forbidden = ADMIN_ONLY_SETTINGS.filter((field) => body[field] !== undefined);
  if (forbidden.length > 0) {
    throw new AppError(
      'SETTINGS_ADMIN_ONLY',
      'Stundenlohn und Abrechnungszeitraum können nur von einem Administrator geändert werden',
      { extra: { fields: forbidden } }
    );
  }
  const settings = await UserService.updateUserSettings(req.user.userId, { lohnzettelEmail: body.lohnzettelEmail }, actorOf(req));
  return { data: { settings } };
});

api.get('/minijob/current', {
  summary: 'Heute gültige Minijob-Grenze',
  response: z.object({ setting: MinijobLimitInfo.extend({ id: z.number().int(), isActive: z.boolean() }) }),
  message: 'Aktuelle Minijob-Einstellung erfolgreich geladen',
  errors: ['NO_CURRENT_SETTING']
}, async () => {
  const current = await MinijobSetting.getCurrentSetting();
  if (!current) {
    throw new AppError('NO_CURRENT_SETTING', 'Keine aktuelle Minijob-Einstellung gefunden', {
      extra: { data: { message: 'Bitte wenden Sie sich an einen Administrator' } }
    });
  }
  return { data: { setting: { id: current.id, ...limitInfo(current), isActive: current.isActive } } };
});

api.get('/dashboard', {
  summary: 'Startseite: Konto, Einstellungen, aktuelle Minijob-Grenze',
  response: DashboardData,
  message: 'Dashboard-Daten erfolgreich geladen'
}, async (req) => {
  const user = await loadSelf(req);
  const current = await MinijobSetting.getCurrentSetting();
  return {
    data: {
      user,
      minijobSetting: current ? limitInfo(current) : null,
      settings: settingsOf(user),
      stats: { currentMonth: { hoursWorked: 0, earnings: 0 } }
    }
  };
});

api.get('/account-status', {
  summary: 'Status des eigenen Kontos',
  response: AccountStatusData,
  message: 'Account-Status erfolgreich ermittelt'
}, async (req) => {
  // Auch deaktivierte Konten liefern hier einen Status (kein 403)
  const user = await loadSelf(req, { rejectInactive: false });
  return {
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      status: {
        isActive: user.isActive,
        statusCode: user.isActive ? 'active' : 'inactive',
        message: user.isActive
          ? 'Account ist aktiv und verfügbar'
          : 'Account ist deaktiviert - bitte wenden Sie sich an einen Administrator',
        memberSince: user.createdAt,
        lastUpdated: user.updatedAt
      }
    }
  };
});

api.post('/logout', {
  summary: 'Abmelden (veraltet, gleichwertig zu POST /auth/logout)',
  message: 'Erfolgreich abgemeldet'
}, async (req, res) => {
  await SessionService.revoke(req.user.sid, 'logout');
  clearAuthCookies(res);
  return {};
});

module.exports = api.router;
