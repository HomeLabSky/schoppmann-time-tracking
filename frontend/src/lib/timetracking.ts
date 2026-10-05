import { apiClient } from './api'

/**
 * Zeiterfassung des angemeldeten Mitarbeiters (`/api/timetracking`).
 * Fachregeln (Zeitraum, Dauer, Pause, Nachtschicht) prüft das Backend; das Formular-Schema in
 * `@/schemas` gibt vorab Rückmeldung. Beträge kommen fertig gerechnet vom Server.
 */

export interface TimeRecord {
  id: number
  userId: number
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  description?: string | null
  workMinutes: number
  workTime: string
  totalHours: number
  earnings: number
  formattedEarnings: string
  hourlyRate?: number
  createdAt: string
  updatedAt: string
}

export interface TimeRecordSummary {
  totalHours: number
  totalEarnings: number
  actualEarnings: number
  carryIn: number
  carryOut: number
  paidThisMonth: number
  minijobLimit: number
  hourlyRate: number
  exceedsLimit: boolean
  /** Keine Minijob-Grenze hinterlegt: Auszahlung/Übertrag nur vorläufig, Abschluss gesperrt. */
  minijobLimitMissing?: boolean
  entryCount: number
}

export interface BillingPeriod {
  /** Referenzmonat (YYYY-MM), wird als `month` an die API übergeben */
  value: string
  label: string
  year: number
  month: number
  monthName: string
  startDate: string
  endDate: string
  isCurrent: boolean
  isClosed?: boolean
}

export interface MonthlyTimeRecords {
  records: TimeRecord[]
  summary: TimeRecordSummary
  period: {
    year: number
    month: number
    monthName: string
    startDate: string
    endDate: string
    description: string
    status?: 'open' | 'closed'
  }
  closure?: { closedAt: string; closedBy?: number | null; periodStart: string; periodEnd: string } | null
}

export interface TimeEntryPayload {
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  description?: string
}

type Envelope<T> = { success: boolean; message: string; data: T }

export const timeApi = {
  getMonth: (month: string) =>
    apiClient.get<Envelope<MonthlyTimeRecords>>(`/api/timetracking?month=${month}`).then((r) => r.data),

  getPeriods: () =>
    apiClient
      .get<Envelope<{ periods: BillingPeriod[]; currentPeriod?: BillingPeriod }>>('/api/timetracking/periods')
      .then((r) => r.data),

  create: (entry: TimeEntryPayload) =>
    apiClient.post<Envelope<{ entry: TimeRecord }>>('/api/timetracking', entry).then((r) => r.data.entry),

  update: (id: number, entry: Omit<TimeEntryPayload, 'date'>) =>
    apiClient.put<Envelope<{ entry: TimeRecord }>>(`/api/timetracking/${id}`, entry).then((r) => r.data.entry),

  remove: (id: number) => apiClient.delete<Envelope<unknown>>(`/api/timetracking/${id}`),
}
