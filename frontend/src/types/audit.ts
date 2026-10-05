// Typen für Zeitnachweise (Admin), Monatsabschluss und Änderungsprotokoll

import type { MonthlyTimeRecords } from '@/lib/timetracking'

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface TimesheetPeriod {
  /** Referenzmonat (YYYY-MM) – wird als `month` an die API übergeben */
  value: string
  label: string
  startDate: string
  endDate: string
  isCurrent: boolean
  isClosed?: boolean
}

export type Timesheet = MonthlyTimeRecords

/** Eine Zeile der Monatsübersicht aller Mitarbeiter (GET /api/admin/timesheets/overview). */
export interface TimesheetOverviewRow {
  userId: number
  name: string
  email: string
  isActive: boolean
  periodStart: string
  periodEnd: string
  entryCount: number
  totalHours: number
  totalEarnings: number
  paidThisMonth: number
  carryOut: number
  minijobLimit: number
  minijobLimitMissing: boolean
  exceedsLimit: boolean
  /** open: läuft noch · ready: beendet, abschließbar · closed: abgeschlossen */
  status: 'open' | 'ready' | 'closed'
  closedAt: string | null
}

export interface AuditEntry {
  id: number
  createdAt: string
  actorId: number | null
  actorEmail: string
  action: string
  entityType: string
  entityId: number | null
  targetUserId: number | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  meta: Record<string, unknown> | null
}

export interface AuditQuery {
  page?: number
  limit?: number
  userId?: number | string
  action?: string
  /** kommagetrennte Vorgangs-Präfixe, die ausgeblendet werden, z. B. "auth" */
  exclude?: string
  from?: string
  to?: string
}

export interface BackupStatus {
  state: 'ok' | 'warning' | 'error' | 'unknown'
  message: string
  localAgeHours: number | null
  offsiteAgeHours: number | null
  offsiteConfigured: boolean
  lastSuccessAt: string | null
  offsiteLastSuccessAt: string | null
  lastAttemptAt: string | null
  lastFile: string | null
  lastError: string | null
}
