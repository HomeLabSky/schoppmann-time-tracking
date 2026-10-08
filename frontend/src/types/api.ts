// Typen der REST-API (Antwortformat siehe Envelope in lib/api.ts).
// Formular-Eingaben werden in src/schemas (zod) definiert.

export type Role = 'admin' | 'mitarbeiter'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  isActive: boolean
  createdAt?: string
  updatedAt?: string
  stundenlohn?: number
  abrechnungStart?: number
  abrechnungEnde?: number
  lohnzettelEmail?: string
  /** Nacherfassung freigegeben bis zu diesem Tag zurück (YYYY-MM-DD); null = nur einen Monat */
  nacherfassungAb?: string | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  name: string
  email: string
  password: string
}

/** Einheitlicher Fehler aller API-Aufrufe (wird von lib/api.ts geworfen). */
export interface ApiError {
  status?: number
  error: string
  code?: string
  details?: string[]
  /** Feldgenaue Validierungsfehler des Backends ({ feldname: meldung }) */
  fields?: Record<string, string>
}

export interface NewUser {
  name: string
  email: string
  password: string
  role: Role
}

export interface EditUser {
  name: string
  email: string
  /** nur wenn geändert */
  password?: string
  role: Role
  isActive: boolean
}

export interface UserSettings {
  stundenlohn: number
  abrechnungStart: number
  abrechnungEnde: number
  lohnzettelEmail: string
  /** '' oder null hebt die Freigabe auf */
  nacherfassungAb?: string | null
}

/** Lohnzettel einer abgeschlossenen Periode (Beträge beim Abschluss festgeschrieben, in Euro) */
export interface Payslip {
  /** Kennung des Abschlusses – für den PDF-Download */
  id: number
  /** z. B. "August 2026" */
  label: string
  periodStart: string
  periodEnd: string
  closedAt: string
  totalHours: number
  earnings: number
  /** Auszahlung inkl. Sonderposten (höchstens die Grenze) */
  paid: number
  /** Sonderposten der Periode (in der Auszahlung bzw. im Übertrag enthalten) */
  specialItems: number
  /** Gleich paid */
  payout: number
  carryOut: number
}

export interface SpecialItemPayload {
  date: string
  description: string
  amount: number
}

export interface MinijobSetting {
  id: number
  monthlyLimit: number
  description: string
  validFrom: string
  validUntil: string | null
  isActive: boolean
  createdAt: string
  updatedAt?: string
  createdBy?: number
  Creator?: {
    name: string
    email: string
  }
}

export interface NewMinijobSetting {
  monthlyLimit: number
  description: string
  validFrom: string
  validUntil: string | null
}

/** Laufende Sitzung (angemeldeter Browser oder App-Gerät) */
export interface SessionInfo {
  id: string
  clientType: 'web' | 'app'
  /** Gerätename (App) oder Browser/System, z. B. "Edge unter Windows" */
  label: string
  deviceName: string | null
  userAgent: string | null
  ip: string | null
  createdAt: string
  /** auf etwa 5 Minuten genau */
  lastUsedAt: string
  expiresAt: string
  /** Die Sitzung dieses Browsers */
  current: boolean
}
