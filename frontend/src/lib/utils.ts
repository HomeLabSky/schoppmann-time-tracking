import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Klassen zusammenführen; spätere Tailwind-Klassen überschreiben frühere (z. B. `p-2` + `p-4` → `p-4`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

const hoursFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Stunden als Dezimalzahl im deutschen Format, z. B. "9,50 Std.". */
export function formatHours(hours: number | null | undefined): string {
  return `${hoursFormat.format(hours ?? 0)} Std.`
}

export function formatDate(dateString: string): string {
  if (!dateString) return 'Kein Datum'
  return new Date(dateString + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return 'Kein Datum'
  return new Date(dateString).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function validatePassword(password: string): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('Passwort muss mindestens 8 Zeichen haben')
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('Passwort muss mindestens einen Kleinbuchstaben enthalten')
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('Passwort muss mindestens einen Großbuchstaben enthalten')
  }
  
  if (!/(?=.*\d)/.test(password)) {
    errors.push('Passwort muss mindestens eine Zahl enthalten')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Lokales Kalenderdatum als YYYY-MM-DD.
 * `date.toISOString().split('T')[0]` liefert das UTC-Datum – in Deutschland zwischen
 * 0:00 und 1:00/2:00 Uhr noch "gestern" und bei `new Date(jahr, monat, 0)` (Monatsletzter,
 * lokale Mitternacht) einen Tag zu früh.
 */
export function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Lesbarer Text aus einem API-Fehler ({ error, details }) oder einem Error. */
export function getErrorMessage(error: unknown, fallback = 'Unbekannter Fehler'): string {
  if (error && typeof error === 'object') {
    const e = error as { error?: string; details?: string[] | string; message?: string }
    if (Array.isArray(e.details) && e.details.length > 0) return e.details.join(', ')
    if (e.error) return e.error
    if (e.message) return e.message
  }
  return fallback
}

/** "vor 5 Minuten", "vor 3 Stunden", "vor 2 Tagen" – für Aktivitätslisten. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `vor ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`
  const days = Math.round(hours / 24)
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
}
