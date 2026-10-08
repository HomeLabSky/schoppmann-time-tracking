/**
 * Selbstbedienung (/employee) für angemeldete Mitarbeiter und Admins.
 *
 * Dünne Controller-Schicht: Geschäftslogik im UserService; Minijob-Grenze nur lesend.
 * Lohn und Abrechnungszeitraum legt ausschließlich ein Admin fest (PUT /admin/users/:id/settings).
 */
import type { Request } from 'express';
import type { MinijobSetting } from '../db/schema';
import type { SafeUser } from '../models/user';
import { MinijobService } from '../services/minijobService';
import { PayslipService } from '../services/payslipService';
import config from '../config';
import { payslipFilename, renderPayslipsPdf } from '../utils/payslipPdf';
import { createApiRouter } from '../lib/route';
import { AppError } from '../lib/errors';
import { UserService } from '../services/userService';
import { SessionService } from '../services/sessionService';
import { clearAuthCookies } from '../utils/authCookies';
import { actorOf } from '../middleware/auth';
import { ProfileUpdateBody, UserData } from '../schemas/auth';
import {
  UserSettingsBody, Settings, EmployeeChangePasswordBody, EmployeeSettingsData, MinijobLimitInfo, DashboardData, AccountStatusData
} from '../schemas/user';
import { PayslipListData } from '../schemas/payslip';
import { idParam, z } from '../schemas/common';

const api = createApiRouter('/employee', { tags: ['Mitarbeiter'] });

/** Eigenes Konto (auch deaktiviert); wirft USER_NOT_FOUND bzw. USER_INACTIVE */
const loadSelf = async (req: Request, { rejectInactive = true } = {}): Promise<SafeUser> => {
  const user = await UserService.findUserById(req.user?.userId ?? 0, true);
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  if (rejectInactive && !user.isActive) throw new AppError('USER_INACTIVE', 'Benutzer ist deaktiviert');
  return user;
};

const settingsOf = (user: SafeUser) => ({
  stundenlohn: user.stundenlohn ?? 12.0,
  abrechnungStart: user.abrechnungStart || 1,
  abrechnungEnde: user.abrechnungEnde || 31,
  lohnzettelEmail: user.lohnzettelEmail || user.email,
  nacherfassungAb: user.nacherfassungAb ?? null
});

const limitInfo = (setting: MinijobSetting) => ({
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
const ADMIN_ONLY_SETTINGS = ['stundenlohn', 'abrechnungStart', 'abrechnungEnde'] as const;

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
  const current = MinijobService.currentSettingSync();
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
  const current = MinijobService.currentSettingSync();
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

api.get('/payslips', {
  summary: 'Eigene Lohnzettel (alle abgeschlossenen Perioden, neueste zuerst)',
  tags: ['Lohnzettel'],
  response: PayslipListData,
  message: 'Lohnzettel erfolgreich geladen'
}, async (req) => ({ data: { payslips: PayslipService.listForUser(req.user.userId) } }));

api.get('/payslips/:id/pdf', {
  summary: 'Eigenen Lohnzettel als PDF herunterladen',
  description: 'Nur für abgeschlossene Perioden; zeigt die beim Abschluss festgeschriebenen Beträge.',
  tags: ['Lohnzettel'],
  params: idParam('id', 'Lohnzettel-ID'),
  produces: 'application/pdf',
  message: 'Lohnzettel als PDF',
  errors: ['PAYSLIP_NOT_FOUND']
}, async (req) => {
  const payslip = PayslipService.forClosure(req.user.userId, req.valid.params.id);
  const body = await renderPayslipsPdf([payslip], { companyAddress: config.payslip.companyAddress });
  return { file: { body, filename: payslipFilename(payslip.period.endDate, payslip.employee.name), contentType: 'application/pdf' } };
});

api.post('/logout', {
  summary: 'Abmelden (veraltet, gleichwertig zu POST /auth/logout)',
  message: 'Erfolgreich abgemeldet'
}, async (req, res) => {
  await SessionService.revoke(req.user.sid, 'logout');
  clearAuthCookies(res);
  return {};
});

export default api.router;
