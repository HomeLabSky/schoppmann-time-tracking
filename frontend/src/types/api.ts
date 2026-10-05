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
