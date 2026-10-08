import type { AuditEntry } from '@/types/audit'
import { formatCurrency, formatDate } from './utils'

// Lesbare Bezeichnungen der Protokoll-Vorgänge (Änderungsprotokoll und Admin-Startseite)

export const ACTION_LABELS: Record<string, string> = {
  'time_entry.create': 'Zeiteintrag angelegt',
  'time_entry.update': 'Zeiteintrag geändert',
  'time_entry.delete': 'Zeiteintrag gelöscht',
  'auth.login': 'Anmeldung',
  'auth.login_failed': 'Anmeldung fehlgeschlagen',
  'auth.logout': 'Abmeldung',
  'auth.session_reuse_detected': 'Sitzung beendet (Token wiederverwendet)',
  'auth.account_locked': 'Anmeldung gesperrt (zu viele Fehlversuche)',
  'auth.session_revoke': 'Gerät abgemeldet',
  'auth.sessions_revoke_others': 'Auf allen anderen Geräten abgemeldet',
  'auth.sessions_revoke_all': 'Überall abgemeldet (durch Admin)',
  'special_item.create': 'Sonderposten erfasst',
  'special_item.update': 'Sonderposten geändert',
  'special_item.delete': 'Sonderposten gelöscht',
  'period.close': 'Periode abgeschlossen',
  'period.reopen': 'Periode wieder geöffnet',
  'user.create': 'Benutzer angelegt',
  'user.update': 'Benutzer geändert',
  'user.profile_update': 'Profil geändert',
  'user.settings_update': 'Arbeitseinstellungen geändert',
  'user.password_change': 'Passwort geändert',
  'user.activate': 'Benutzer aktiviert',
  'user.deactivate': 'Benutzer deaktiviert',
  'user.delete': 'Benutzer gelöscht',
  'minijob_setting.create': 'Minijob-Grenze angelegt',
  'minijob_setting.update': 'Minijob-Grenze geändert',
  'minijob_setting.delete': 'Minijob-Grenze gelöscht',
  'minijob_setting.recalculate': 'Minijob-Zeiträume neu berechnet',
}

export const ACTION_FILTERS = [
  { value: '', label: 'Alle Vorgänge' },
  { value: 'time_entry', label: 'Zeiteinträge' },
  { value: 'special_item', label: 'Sonderposten' },
  { value: 'period', label: 'Monatsabschluss' },
  { value: 'user', label: 'Benutzer' },
  { value: 'auth', label: 'Anmeldungen' },
  { value: 'minijob_setting', label: 'Minijob-Grenzen' },
]

export const FIELD_LABELS: Record<string, string> = {
  date: 'Datum',
  startTime: 'Beginn',
  endTime: 'Ende',
  breakMinutes: 'Pause (Min.)',
  description: 'Beschreibung',
  hourlyRateCents: 'Stundensatz',
  email: 'E-Mail',
  name: 'Name',
  role: 'Rolle',
  isActive: 'Aktiv',
  stundenlohn: 'Stundenlohn',
  abrechnungStart: 'Abrechnung ab Tag',
  abrechnungEnde: 'Abrechnung bis Tag',
  lohnzettelEmail: 'Lohnzettel-E-Mail',
  monthlyLimit: 'Monatsgrenze',
  validFrom: 'Gültig ab',
  validUntil: 'Gültig bis',
  periodStart: 'Periode von',
  periodEnd: 'Periode bis',
  entryCount: 'Einträge',
  totalMinutes: 'Minuten',
  earnings: 'Verdienst',
  limit: 'Grenze',
  carryIn: 'Übertrag Vorperiode',
  paid: 'Auszahlung',
  carryOut: 'Übertrag',
  amount: 'Betrag',
  specialItems: 'Sonderposten',
  billingDate: 'Abgerechnet ab',
  reason: 'Grund',
  ip: 'IP-Adresse',
  revokedCount: 'Beendete Sitzungen',
  client: 'Zugang',
  device: 'Gerät',
}

const MONEY_FIELDS = new Set(['earnings', 'limit', 'carryIn', 'paid', 'carryOut', 'stundenlohn', 'monthlyLimit', 'amount', 'specialItems'])

export const formatValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '–'
  if (key === 'hourlyRateCents') return `${formatCurrency(Number(value) / 100)}/Std.`
  if (MONEY_FIELDS.has(key)) return formatCurrency(Number(value))
  if (typeof value === 'boolean') return value ? 'ja' : 'nein'
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDate(String(value))
  return String(value)
}

export interface Change { key: string; from?: unknown; to?: unknown }

/** Nur geänderte Felder (Update), bzw. alle Felder bei Anlegen/Löschen. */
export const changesOf = (entry: AuditEntry): Change[] => {
  const before = entry.before ?? {}
  const after = entry.after ?? {}
  if (entry.before && entry.after) {
    return Object.keys({ ...before, ...after })
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => ({ key, from: before[key], to: after[key] }))
  }
  const single = (entry.after ?? entry.before ?? {}) as Record<string, unknown>
  return Object.keys(single).map((key) => ({ key, to: entry.after ? single[key] : undefined, from: entry.after ? undefined : single[key] }))
}
