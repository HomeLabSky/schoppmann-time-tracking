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
  /**
   * Nachtrag: Der Tag lag beim Erfassen in einer abgeschlossenen Periode. Abgerechnet wird der Eintrag in der
   * Periode, die dieses Datum enthält. null = Periode des Arbeitstags.
   */
  billingDate?: string | null
  createdAt: string
  updatedAt: string
}

/** Sonderposten: privat verauslagter Betrag, wird mit dem Lohn ausgezahlt und zählt zur Grenze (erfasst der Mitarbeiter selbst) */
export interface SpecialItem {
  id: number
  userId: number
  /** Kaufdatum */
  date: string
  description: string
  amountCents: number
  /** Betrag in Euro */
  amount: number
  /** Nachtrag: Kaufdatum lag in einer abgeschlossenen Periode, erstattet in der Periode mit diesem Datum */
  billingDate: string | null
  createdAt: string
  updatedAt: string
}

export interface TimeRecordSummary {
  totalHours: number
  totalEarnings: number
  actualEarnings: number
  carryIn: number
  carryOut: number
  /** Auszahlung inkl. Sonderposten (höchstens die Grenze) */
  paidThisMonth: number
  /** Summe der Sonderposten (zählen wie der Verdienst gegen die Grenze) */
  specialItemsTotal: number
  /** Gleich paidThisMonth (Sonderposten sind enthalten) */
  payout: number
  minijobLimit: number
  hourlyRate: number
  exceedsLimit: boolean
  /** Keine Minijob-Grenze hinterlegt: Auszahlung/Übertrag nur vorläufig, Abschluss gesperrt. */
  minijobLimitMissing?: boolean
  entryCount: number
  /** Tage mit Einträgen (mehrere Einträge pro Tag möglich) */
  workDays: number
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
  /** Sonderposten, die in dieser Periode erstattet werden */
  specialItems: SpecialItem[]
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
  /** `id`: Kennung des Abschlusses (Lohnzettel-Download) */
  closure?: { id: number; closedAt: string; closedBy?: number | null; periodStart: string; periodEnd: string } | null
}

export interface TimeEntryPayload {
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  description?: string
}

export interface SpecialItemPayload {
  date: string
  description: string
  amount: number
}

type Envelope<T> = { success: boolean; message: string; data: T }

/** Periode, die das Datum enthält (YYYY-MM-DD) */
export function periodContaining<P extends { startDate: string; endDate: string }>(periods: P[] | undefined, date: string): P | undefined {
  return periods?.find((p) => p.startDate <= date && p.endDate >= date)
}

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

  // Sonderposten: eigene, privat verauslagte Beträge
  createSpecialItem: (item: SpecialItemPayload) =>
    apiClient.post<Envelope<{ item: SpecialItem }>>('/api/timetracking/special-items', item).then((r) => r.data.item),

  updateSpecialItem: (id: number, item: SpecialItemPayload) =>
    apiClient.put<Envelope<{ item: SpecialItem }>>(`/api/timetracking/special-items/${id}`, item).then((r) => r.data.item),

  removeSpecialItem: (id: number) => apiClient.delete<Envelope<unknown>>(`/api/timetracking/special-items/${id}`),
}
