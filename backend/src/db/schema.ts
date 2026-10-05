/**
 * Datenbankschema (Drizzle) – eine Wahrheit für Abfragen, Typen und Migrationen.
 *
 * Tabellen-, Spalten- und Indexnamen entsprechen den ursprünglich von Sequelize angelegten Tabellen, damit
 * bestehende Datenbanken übernommen werden können (siehe db/migrate.ts). Schemaänderungen: hier ändern, dann
 * `npm run db:generate` erzeugt die Migration in drizzle/ (wird beim Start automatisch angewendet).
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { dateOnly, jsonText, timeOfDay, timestamp } from './columns';

const createdAt = () => timestamp('createdAt').notNull().$defaultFn(() => new Date());
const updatedAt = () => timestamp('updatedAt').notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const ROLES = ['admin', 'mitarbeiter'] as const;
export type Role = (typeof ROLES)[number];
export const CLIENT_TYPES = ['web', 'app'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const users = sqliteTable('Users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email', { length: 255 }).notNull(),
  password: text('password', { length: 255 }).notNull(),
  name: text('name', { length: 255 }).notNull(),
  role: text('role', { enum: ROLES }).notNull().default('mitarbeiter'),
  isActive: integer('isActive', { mode: 'boolean' }).default(true),
  /** Stundenlohn in Euro (aktueller Satz; Zeiteinträge frieren ihren Satz in Cent ein) */
  stundenlohn: real('stundenlohn').default(12),
  abrechnungStart: integer('abrechnungStart').notNull().default(1),
  abrechnungEnde: integer('abrechnungEnde').notNull().default(31),
  lohnzettelEmail: text('lohnzettelEmail', { length: 255 }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex('users_email').on(t.email),
  index('users_role').on(t.role),
  index('users_is_active').on(t.isActive),
  check('users_role_check', sql`${t.role} IN ('admin', 'mitarbeiter')`),
  check('users_is_active_check', sql`${t.isActive} IN (0, 1)`),
  check('users_stundenlohn_check', sql`${t.stundenlohn} IS NULL OR ${t.stundenlohn} BETWEEN 0 AND 999`),
  check('users_abrechnung_start_check', sql`${t.abrechnungStart} BETWEEN 1 AND 31`),
  check('users_abrechnung_ende_check', sql`${t.abrechnungEnde} BETWEEN 1 AND 31`)
]);

export const minijobSettings = sqliteTable('MinijobSettings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Monatliche Verdienstgrenze in Euro */
  monthlyLimit: real('monthlyLimit').notNull(),
  description: text('description', { length: 500 }).notNull(),
  validFrom: dateOnly('validFrom').notNull(),
  /** NULL = unbegrenzt */
  validUntil: dateOnly('validUntil'),
  isActive: integer('isActive', { mode: 'boolean' }).default(false),
  createdBy: integer('createdBy').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index('minijob_settings_valid_from').on(t.validFrom),
  index('minijob_settings_is_active').on(t.isActive),
  index('minijob_settings_valid_from_valid_until').on(t.validFrom, t.validUntil),
  index('minijob_settings_created_by').on(t.createdBy),
  check('minijob_settings_limit_check', sql`${t.monthlyLimit} BETWEEN 0 AND 999999.99`),
  check('minijob_settings_range_check', sql`${t.validUntil} IS NULL OR ${t.validUntil} > ${t.validFrom}`),
  check('minijob_settings_is_active_check', sql`${t.isActive} IN (0, 1)`)
]);

export const timeEntries = sqliteTable('TimeEntries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  /** Vom Client erzeugte Kennung (App, Offline-Erfassung): Wiederholungen legen nichts doppelt an */
  clientId: text('clientId', { length: 64 }),
  date: dateOnly('date').notNull(),
  startTime: timeOfDay('startTime').notNull(),
  endTime: timeOfDay('endTime').notNull(),
  breakMinutes: integer('breakMinutes').notNull().default(30),
  description: text('description', { length: 500 }),
  /** Stundensatz in Cent, beim Anlegen eingefroren */
  hourlyRateCents: integer('hourlyRateCents'),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  // Mehrere Einträge pro Tag erlaubt; Überschneidungen verhindern die Trigger aus drizzle/0004
  index('time_entries_user_date').on(t.userId, t.date),
  uniqueIndex('unique_user_client_id').on(t.userId, t.clientId),
  index('time_entries_date').on(t.date),
  check('time_entries_break_check', sql`${t.breakMinutes} BETWEEN 0 AND 480`),
  check('time_entries_rate_check', sql`${t.hourlyRateCents} IS NULL OR ${t.hourlyRateCents} >= 0`),
  check('time_entries_date_check', sql`${t.date} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`),
  check('time_entries_start_check', sql`${t.startTime} GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'`),
  check('time_entries_end_check', sql`${t.endTime} GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'`),
  check('time_entries_range_check', sql`${t.startTime} <> ${t.endTime}`)
]);

/** Änderungsprotokoll: nur anfügen (Trigger verhindern UPDATE/DELETE, siehe drizzle/0001) */
export const auditLogs = sqliteTable('AuditLogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Auslöser (NULL = System/Skript) */
  actorId: integer('actorId'),
  /** E-Mail des Auslösers zum Zeitpunkt der Änderung */
  actorEmail: text('actorEmail', { length: 255 }).notNull().default('system'),
  action: text('action', { length: 64 }).notNull(),
  entityType: text('entityType', { length: 64 }).notNull(),
  entityId: integer('entityId'),
  /** Betroffener Mitarbeiter */
  targetUserId: integer('targetUserId'),
  before: jsonText('before'),
  after: jsonText('after'),
  meta: jsonText('meta'),
  createdAt: createdAt()
}, (t) => [
  index('audit_logs_created_at').on(t.createdAt),
  index('audit_logs_target_user_id_created_at').on(t.targetUserId, t.createdAt),
  index('audit_logs_entity_type_entity_id').on(t.entityType, t.entityId),
  index('audit_logs_action').on(t.action)
]);

/** Monatsabschluss: eingefrorene Zahlen einer Abrechnungsperiode (Beträge in Cent) */
export const periodClosures = sqliteTable('PeriodClosures', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  periodStart: dateOnly('periodStart').notNull(),
  periodEnd: dateOnly('periodEnd').notNull(),
  closedBy: integer('closedBy'),
  closedAt: timestamp('closedAt').notNull().$defaultFn(() => new Date()),
  entryCount: integer('entryCount').notNull().default(0),
  totalMinutes: integer('totalMinutes').notNull().default(0),
  earningsCents: integer('earningsCents').notNull().default(0),
  limitCents: integer('limitCents').notNull(),
  carryInCents: integer('carryInCents').notNull().default(0),
  paidCents: integer('paidCents').notNull().default(0),
  carryOutCents: integer('carryOutCents').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex('unique_user_period_start').on(t.userId, t.periodStart),
  index('period_closures_user_id_period_end').on(t.userId, t.periodEnd),
  check('period_closures_range_check', sql`${t.periodEnd} >= ${t.periodStart}`)
]);

/** Anmelde-Sitzung (Web oder App); gespeichert wird nur ein HMAC-Prüfwert des Erneuerungs-Tokens */
export const sessions = sqliteTable('Sessions', {
  id: text('id', { length: 36 }).primaryKey(),
  userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  refreshHash: text('refreshHash', { length: 64 }).notNull(),
  previousHash: text('previousHash', { length: 64 }),
  rotatedAt: timestamp('rotatedAt'),
  lastUsedAt: timestamp('lastUsedAt').notNull(),
  /** Ablauf des Erneuerungs-Tokens (gleitend) */
  expiresAt: timestamp('expiresAt').notNull(),
  /** Späteste Gültigkeit der Sitzung */
  absoluteExpiresAt: timestamp('absoluteExpiresAt').notNull(),
  revokedAt: timestamp('revokedAt'),
  revokedReason: text('revokedReason', { length: 64 }),
  clientType: text('clientType', { length: 8, enum: CLIENT_TYPES }).notNull().default('web'),
  deviceName: text('deviceName', { length: 100 }),
  ip: text('ip', { length: 64 }),
  userAgent: text('userAgent', { length: 255 }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index('sessions_user_id').on(t.userId),
  index('sessions_revoked_at').on(t.revokedAt),
  index('sessions_absolute_expires_at').on(t.absoluteExpiresAt),
  check('sessions_client_type_check', sql`${t.clientType} IN ('web', 'app')`)
]);

/** Fehlversuche bei der Anmeldung je E-Mail-Adresse (Konto-Sperre) */
export const loginThrottles = sqliteTable('LoginThrottles', {
  email: text('email', { length: 255 }).primaryKey(),
  failures: integer('failures').notNull().default(0),
  lastFailureAt: timestamp('lastFailureAt'),
  lockedUntil: timestamp('lockedUntil')
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MinijobSetting = typeof minijobSettings.$inferSelect;
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type PeriodClosure = typeof periodClosures.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
