/** Schemas für Zeitnachweise/Monatsabschluss, Änderungsprotokoll und Systemstatus (Admin). */
import { z, integer, isoDate, month, Pagination, timestamp } from './common';

const UserIdParam = z.object({ userId: integer('Benutzer-ID', { min: 1 }) });

const ClosePeriodBody = z.object({ month: month() });

const ReopenPeriodBody = z.object({
  month: month(),
  reason: z.string({ error: 'Bitte eine Begründung angeben (5 bis 500 Zeichen)' })
    .trim()
    .min(5, 'Bitte eine Begründung angeben (5 bis 500 Zeichen)')
    .max(500, 'Bitte eine Begründung angeben (5 bis 500 Zeichen)')
});

const PeriodClosure = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  periodStart: z.string(),
  periodEnd: z.string(),
  closedBy: z.number().int().nullable(),
  closedAt: timestamp(),
  entryCount: z.number().int(),
  totalMinutes: z.number().int(),
  earningsCents: z.number().int(),
  limitCents: z.number().int(),
  carryInCents: z.number().int(),
  paidCents: z.number().int(),
  carryOutCents: z.number().int(),
  createdAt: timestamp(),
  updatedAt: timestamp()
}).meta({ id: 'PeriodClosure', description: 'Monatsabschluss mit eingefrorenen Zahlen (Beträge in Cent)' });

const ClosureData = z.object({ closure: PeriodClosure });
const ReopenData = z.object({ periodStart: z.string(), periodEnd: z.string() });

const AuditQuery = z.object({
  page: integer('Seite', { min: 1 }).optional(),
  limit: integer('Anzahl', { min: 1, max: 200 }).optional(),
  userId: integer('Benutzer-ID', { min: 1 }).optional(),
  action: z.string().trim().max(64).optional().describe('Präfix, z. B. "time_entry"'),
  exclude: z.string().trim().max(200).optional().describe('Kommagetrennte Präfixe, die ausgeblendet werden (z. B. "auth")'),
  entityType: z.string().trim().max(64).optional(),
  from: isoDate('from').optional(),
  to: isoDate('to').optional()
});

const AuditEntry = z.object({
  id: z.number().int(),
  actorId: z.number().int().nullable(),
  actorEmail: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.number().int().nullable(),
  targetUserId: z.number().int().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  meta: z.unknown().nullable(),
  createdAt: timestamp()
}).meta({ id: 'AuditEntry', description: 'Eintrag im unveränderlichen Änderungsprotokoll' });

const AuditListData = z.object({ entries: z.array(AuditEntry), pagination: Pagination });

const BackupStatus = z.object({
  state: z.enum(['ok', 'warning', 'error', 'unknown']),
  message: z.string(),
  localAgeHours: z.number().nullable(),
  offsiteAgeHours: z.number().nullable(),
  offsiteConfigured: z.boolean(),
  lastSuccessAt: z.string().nullable(),
  offsiteLastSuccessAt: z.string().nullable(),
  lastAttemptAt: z.string().nullable(),
  lastFile: z.string().nullable(),
  lastError: z.string().nullable()
}).meta({ id: 'BackupStatus' });

export {
  UserIdParam,
  ClosePeriodBody,
  ReopenPeriodBody,
  PeriodClosure,
  ClosureData,
  ReopenData,
  AuditQuery,
  AuditEntry,
  AuditListData,
  BackupStatus
};
