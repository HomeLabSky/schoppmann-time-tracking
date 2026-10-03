import { z, integer, euro, email, newPassword, personName, role, Pagination, User, timestamp } from './common';

const UserListQuery = z.object({
  page: integer('Seite', { min: 1 }).optional(),
  limit: integer('Anzahl', { min: 1, max: 200 }).optional(),
  search: z.string().trim().max(100).optional(),
  role: z.enum(['admin', 'mitarbeiter', '']).optional()
});

const CreateUserBody = z.object({
  email: email(),
  password: newPassword(),
  name: personName(),
  role: role().optional()
});

const UpdateUserBody = z.object({
  email: email().optional(),
  name: personName().optional(),
  // leer = Passwort unverändert lassen (Formular schickt das Feld immer mit)
  password: z.union([z.literal(''), newPassword()]).optional(),
  role: role().optional(),
  isActive: z.boolean({ error: 'isActive muss true oder false sein' }).optional()
});

const settingsFields = {
  stundenlohn: euro('Stundenlohn', 999).optional(),
  abrechnungStart: integer('Abrechnungsstart', { min: 1, max: 31 }).optional(),
  abrechnungEnde: integer('Abrechnungsende', { min: 1, max: 31 }).optional(),
  lohnzettelEmail: z.union([z.literal(''), z.null(), email('Lohnzettel-E-Mail')]).optional()
};

const UserSettingsBody = z.object(settingsFields);

const Settings = z.object({
  stundenlohn: z.union([z.number(), z.string()]).nullable(),
  abrechnungStart: z.number().int(),
  abrechnungEnde: z.number().int(),
  lohnzettelEmail: z.string().nullable()
}).meta({ id: 'WorkSettings', description: 'Arbeitseinstellungen (Lohn und Abrechnungszeitraum legt der Admin fest)' });

const UserListData = z.object({ users: z.array(User), pagination: Pagination });

const UserStats = z.object({
  total: z.number().int(),
  active: z.number().int(),
  inactive: z.number().int(),
  byRole: z.array(z.object({ role: z.string(), total: z.number().int(), active: z.number().int() }))
});

const EmployeeChangePasswordBody = z.object({
  currentPassword: z.string({ error: 'Aktuelles Passwort ist erforderlich' }).min(1, 'Aktuelles Passwort ist erforderlich').max(256),
  newPassword: newPassword('Neues Passwort'),
  confirmPassword: z.string({ error: 'Passwort-Bestätigung ist erforderlich' })
}).refine((body) => body.confirmPassword === body.newPassword, {
  message: 'Passwort-Bestätigung stimmt nicht überein',
  path: ['confirmPassword']
});

const EmployeeSettingsData = z.object({
  settings: Settings,
  userInfo: z.object({ id: z.number().int(), name: z.string(), email: z.string(), role: z.string() })
});

const MinijobLimitInfo = z.object({
  monthlyLimit: z.union([z.number(), z.string()]),
  description: z.string(),
  validFrom: z.string(),
  validUntil: z.string().nullable()
});

const DashboardData = z.object({
  user: User,
  minijobSetting: MinijobLimitInfo.nullable(),
  settings: Settings,
  stats: z.object({ currentMonth: z.object({ hoursWorked: z.number(), earnings: z.number() }) })
});

const AccountStatusData = z.object({
  user: z.object({ id: z.number().int(), email: z.string(), name: z.string(), role: z.string() }),
  status: z.object({
    isActive: z.boolean(),
    statusCode: z.enum(['active', 'inactive']),
    message: z.string(),
    memberSince: timestamp(),
    lastUpdated: timestamp()
  })
});

export {
  UserListQuery,
  CreateUserBody,
  UpdateUserBody,
  UserSettingsBody,
  Settings,
  UserListData,
  UserStats,
  EmployeeChangePasswordBody,
  EmployeeSettingsData,
  MinijobLimitInfo,
  DashboardData,
  AccountStatusData
};
