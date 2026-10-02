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
  from?: string
  to?: string
}
