/**
 * Gemeinsame zod-Bausteine für Eingaben und Antworten.
 *
 * Meldungen sind deutsch und erscheinen im Feld `fields` der Fehlerantwort (VALIDATION_ERROR).
 */
import { z } from 'zod';
import validator from 'validator';

z.config(z.locales.de());

/** Pflichtfeld-Meldung: "fehlt" statt "erwartet string, erhalten undefined" */
const required = (label: string, typeLabel = 'Text') => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? `${label} ist erforderlich` : `${label} muss ${typeLabel} sein`)
});

/** Zahl; aus Kompatibilitätsgründen auch als Zahl-String ("12.50") akzeptiert. */
const numeric = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : value),
    schema
  );

/** Ganzzahl; auch als Zahl-String (Pfad- und Query-Parameter kommen immer als Text). */
const integer = (label: string, { min, max }: { min?: number; max?: number } = {}) => {
  let schema = z.number(required(label, 'eine Zahl')).int(`${label} muss eine ganze Zahl sein`);
  if (min !== undefined) schema = schema.min(min, `${label} muss mindestens ${min} sein`);
  if (max !== undefined) schema = schema.max(max, `${label} darf höchstens ${max} sein`);
  return numeric(schema);
};

/** Höchstens zwei Nachkommastellen (Cent-genau) */
const centPrecise = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

const euro = (label: string, max: number) =>
  numeric(
    z.number(required(label, 'eine Zahl'))
      .min(0, `${label} darf nicht negativ sein`)
      .max(max, `${label} darf höchstens ${max.toLocaleString('de-DE')} € sein`)
      .refine(centPrecise, `${label} darf maximal 2 Dezimalstellen haben`)
  );

/**
 * E-Mail: geprüft und normalisiert wie bisher (validator.normalizeEmail: Kleinschreibung u. a.).
 * Bestehende Konten sind in dieser Form gespeichert – die Anmeldung muss dieselbe Normalisierung verwenden.
 */
const email = (label = 'E-Mail') =>
  z.string(required(label))
    .trim()
    .refine((value) => validator.isEmail(value), 'Bitte eine gültige E-Mail-Adresse eingeben')
    .transform((value) => validator.normalizeEmail(value) || value.toLowerCase());

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const newPassword = (label = 'Passwort') =>
  z.string(required(label))
    .min(8, `${label} muss mindestens 8 Zeichen haben`)
    .max(128, `${label} darf höchstens 128 Zeichen haben`)
    .regex(PASSWORD_RULE, `${label} muss Groß-, Kleinbuchstaben und mindestens eine Zahl enthalten`);

const NAME_RULE = /^[a-zA-ZäöüÄÖÜß\s\-'.]+$/;
const personName = () =>
  z.string(required('Name'))
    .trim()
    .min(2, 'Name muss zwischen 2 und 50 Zeichen haben')
    .max(50, 'Name muss zwischen 2 und 50 Zeichen haben')
    .regex(NAME_RULE, 'Name darf nur Buchstaben, Leerzeichen, Bindestriche und Apostrophe enthalten');

const isoDate = (label = 'Datum') =>
  z.iso.date({ error: (issue: { input?: unknown }) => (issue.input === undefined ? `${label} ist erforderlich` : `${label} muss im Format YYYY-MM-DD sein`) });

const month = () =>
  z.string(required('Monat'))
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Monat muss im Format YYYY-MM sein')
    .describe('Referenzmonat der Abrechnungsperiode (YYYY-MM)');

const clockTime = (label: string) =>
  z.string(required(label))
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, `${label} muss im Format HH:mm sein`);

const role = () =>
  z.enum(['admin', 'mitarbeiter'], { error: 'Rolle muss admin oder mitarbeiter sein' });

const idParam = <N extends string = 'id'>(name: N = 'id' as N, label = 'ID') =>
  z.object({ [name]: integer(label, { min: 1 }) } as Record<N, ReturnType<typeof integer>>);

// ---- Antwort-Bausteine ----

const Pagination = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int()
}).meta({ id: 'Pagination' });

/** Zeitstempel (ISO 8601, UTC) */
const timestamp = () => z.string().describe('Zeitpunkt (ISO 8601)');

const User = z.object({
  id: z.number().int(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'mitarbeiter']),
  isActive: z.boolean(),
  stundenlohn: z.union([z.number(), z.string()]).nullable().describe('Stundenlohn in Euro (aktueller Satz; Einträge frieren ihren Satz ein)'),
  abrechnungStart: z.number().int().describe('Erster Tag der Abrechnungsperiode (1–31)'),
  abrechnungEnde: z.number().int().describe('Letzter Tag der Abrechnungsperiode (1–31); kleiner als Start = monatsübergreifend'),
  lohnzettelEmail: z.string().nullable(),
  createdAt: timestamp(),
  updatedAt: timestamp()
}).meta({ id: 'User', description: 'Benutzerkonto (ohne Passwort)' });

export {
  z,
  required,
  numeric,
  integer,
  euro,
  email,
  newPassword,
  personName,
  isoDate,
  month,
  clockTime,
  role,
  idParam,
  Pagination,
  timestamp,
  User
};
