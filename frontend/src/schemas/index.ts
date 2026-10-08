import { z } from 'zod'
import { toLocalDateString } from '@/lib/utils'

/**
 * Formular-Schemas – spiegeln die Regeln aus backend/middleware/validation.js und utils/billing.js.
 * Das Backend bleibt maßgeblich; diese Schemas geben nur sofortiges Feedback am Feld.
 * Phase 2 (Backend in TypeScript) zieht sie in ein gemeinsames Paket, das beide Seiten importieren.
 */

const NAME_PATTERN = /^[a-zA-ZäöüÄÖÜß\s\-'.]+$/
const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/
const MINIJOB_DESCRIPTION_PATTERN = /^[a-zA-ZäöüÄÖÜß0-9\s\-_.,!?()]+$/

/** Zahl aus einem Eingabefeld mit `valueAsNumber` (leeres Feld = NaN → Fehlermeldung). */
const numberSchema = z.number({ message: 'Bitte eine Zahl eingeben' })

export const roleSchema = z.enum(['admin', 'mitarbeiter'])
export const ROLE_LABELS: Record<z.infer<typeof roleSchema>, string> = {
  admin: 'Administrator',
  mitarbeiter: 'Mitarbeiter',
}

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Mindestens 2 Zeichen')
  .max(50, 'Höchstens 50 Zeichen')
  .regex(NAME_PATTERN, 'Nur Buchstaben, Leerzeichen, Bindestrich und Apostroph')

const emailSchema = z.string().trim().min(1, 'E-Mail ist erforderlich').email('Keine gültige E-Mail-Adresse')

export const passwordSchema = z
  .string()
  .min(8, 'Mindestens 8 Zeichen')
  .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe')
  .regex(/[A-Z]/, 'Mindestens ein Großbuchstabe')
  .regex(/\d/, 'Mindestens eine Zahl')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Passwort ist erforderlich'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const userCreateSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
})
export type UserCreateInput = z.infer<typeof userCreateSchema>

export const userEditSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  /** leer = Passwort unverändert */
  password: z.union([z.literal(''), passwordSchema]),
})
export type UserEditInput = z.infer<typeof userEditSchema>

export const userSettingsSchema = z.object({
  stundenlohn: numberSchema
    .min(0, 'Nicht negativ')
    .max(999, 'Höchstens 999 €')
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Höchstens 2 Nachkommastellen'),
  abrechnungStart: numberSchema.int('Ganze Zahl').min(1, '1 bis 31').max(31, '1 bis 31'),
  abrechnungEnde: numberSchema.int('Ganze Zahl').min(1, '1 bis 31').max(31, '1 bis 31'),
  lohnzettelEmail: z.union([z.literal(''), emailSchema]),
  // Nacherfassung: leer = nur einen Monat zurück
  nacherfassungAb: z.union([
    z.literal(''),
    z.iso.date('Bitte ein Datum wählen').refine((d) => d <= toLocalDateString(), 'Darf nicht in der Zukunft liegen'),
  ]),
})
export type UserSettingsInput = z.infer<typeof userSettingsSchema>

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Aktuelles Passwort ist erforderlich'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Stimmt nicht mit dem neuen Passwort überein' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Neues Passwort muss sich vom aktuellen unterscheiden' })
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>

export const minijobSettingSchema = z
  .object({
    monthlyLimit: numberSchema.positive('Muss größer als 0 sein').max(999999.99, 'Zu groß'),
    description: z
      .string()
      .trim()
      .min(3, 'Mindestens 3 Zeichen')
      .max(500, 'Höchstens 500 Zeichen')
      .regex(MINIJOB_DESCRIPTION_PATTERN, 'Enthält nicht erlaubte Zeichen'),
    validFrom: z.string().min(1, 'Startdatum ist erforderlich'),
    validUntil: z.string(),
  })
  .refine((v) => !v.validUntil || v.validUntil > v.validFrom, { path: ['validUntil'], message: 'Muss nach dem Startdatum liegen' })
export type MinijobSettingInput = z.infer<typeof minijobSettingSchema>

/** Fachregeln für Zeiteinträge (Backend: utils/billing.js RULES). */
export const ENTRY_RULES = { MIN_WORK_MINUTES: 15, MAX_SPAN_MINUTES: 12 * 60, MAX_BREAK_MINUTES: 480 }

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Spanne zwischen Start und Ende; endet die Schicht vor dem Start, geht sie über Mitternacht. */
export const spanMinutes = (start: string, end: string) => {
  const diff = toMinutes(end) - toMinutes(start)
  return diff < 0 ? diff + 24 * 60 : diff
}

export const timeEntrySchema = z
  .object({
    date: z.string().min(1, 'Datum ist erforderlich'),
    startTime: z.string().regex(TIME_PATTERN, 'Format HH:MM'),
    endTime: z.string().regex(TIME_PATTERN, 'Format HH:MM'),
    breakMinutes: numberSchema
      .int('Ganze Minuten')
      .min(0, 'Nicht negativ')
      .max(ENTRY_RULES.MAX_BREAK_MINUTES, `Höchstens ${ENTRY_RULES.MAX_BREAK_MINUTES} Minuten`),
    description: z.string().trim().max(500, 'Höchstens 500 Zeichen'),
  })
  .superRefine((v, ctx) => {
    if (!TIME_PATTERN.test(v.startTime) || !TIME_PATTERN.test(v.endTime)) return
    if (v.startTime === v.endTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Ende darf nicht gleich Beginn sein' })
      return
    }
    const span = spanMinutes(v.startTime, v.endTime)
    if (span > ENTRY_RULES.MAX_SPAN_MINUTES) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Höchstens 12 Stunden' })
    }
    if (span - v.breakMinutes < ENTRY_RULES.MIN_WORK_MINUTES) {
      ctx.addIssue({ code: 'custom', path: ['breakMinutes'], message: 'Arbeitszeit nach Pause mindestens 15 Minuten' })
    }
  })
export type TimeEntryInput = z.infer<typeof timeEntrySchema>
