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
  specialItemsCents: z.number().int().describe('Summe der Sonderposten (Erstattung zusätzlich zum Lohn)'),
  createdAt: timestamp(),
  updatedAt: timestamp()
}).meta({ id: 'PeriodClosure', description: 'Monatsabschluss mit eingefrorenen Zahlen (Beträge in Cent)' });

const ClosureData = z.object({ closure: PeriodClosure });
const ReopenData = z.object({ periodStart: z.string(), periodEnd: z.string() });

const TimesheetOverviewRow = z.object({
  userId: z.number().int(),
  name: z.string(),
  email: z.string(),
  isActive: z.boolean(),
  periodStart: z.string().describe('Beginn der Abrechnungsperiode des Mitarbeiters (YYYY-MM-DD)'),
  periodEnd: z.string().describe('Ende der Abrechnungsperiode des Mitarbeiters (YYYY-MM-DD)'),
  entryCount: z.number().int(),
  workDays: z.number().int().describe('Anzahl Tage mit Einträgen'),
  totalHours: z.number(),
  totalEarnings: z.number().describe('Verdienst der Periode in Euro'),
  paidThisMonth: z.number().describe('Lohn-Auszahlung dieser Periode (höchstens die Grenze)'),
  specialItemsTotal: z.number().describe('Summe der Sonderposten in Euro'),
  payout: z.number().describe('Gesamtauszahlung: Lohn + Sonderposten'),
  carryOut: z.number().describe('Übertrag in die nächste Periode'),
  minijobLimit: z.number(),
  minijobLimitMissing: z.boolean().describe('Offene Periode ohne gültige Minijob-Grenze (Abschluss gesperrt)'),
  exceedsLimit: z.boolean(),
  billable: z.boolean().describe('Etwas abzurechnen (Einträge, Sonderposten oder Übertrag) oder bereits abgeschlossen; sonst gibt es nichts abzuschließen'),
  status: z.enum(['open', 'ready', 'closed']).describe('open: läuft noch · ready: beendet, abschließbar · closed: abgeschlossen'),
  closedAt: timestamp().nullable()
}).meta({ id: 'TimesheetOverviewRow', description: 'Kennzahlen eines Mitarbeiters in seiner Abrechnungsperiode' });

const TimesheetOverviewData = z.object({
  month: z.string().describe('Referenzmonat (YYYY-MM)'),
  rows: z.array(TimesheetOverviewRow)
});

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
  TimesheetOverviewRow,
  TimesheetOverviewData,
  AuditQuery,
  AuditEntry,
  AuditListData,
  BackupStatus
};
