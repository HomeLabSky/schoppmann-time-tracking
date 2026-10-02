import { clsx, type ClassValue } from "clsx"

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount)
}

export function formatDate(dateString: string): string {
  if (!dateString) return 'Kein Datum'
  return new Date(dateString + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return 'Kein Datum'
  return new Date(dateString).toLocaleString('de-DE')
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
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

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isClient(): boolean {
  return typeof window !== 'undefined'
}

export function getStorageItem(key: string): string | null {
  if (!isClient()) return null
  return localStorage.getItem(key)
}

export function setStorageItem(key: string, value: string): void {
  if (!isClient()) return
  localStorage.setItem(key, value)
}

export function removeStorageItem(key: string): void {
  if (!isClient()) return
  localStorage.removeItem(key)
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
