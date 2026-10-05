/**
 * Reine Rechenlogik der Abrechnung (ohne Datenbank, ohne Zeitabhängigkeit).
 *
 * Alle Beträge werden in ganzen Cent gerechnet; erst die API-Antwort wandelt
 * in Euro um. Dadurch gibt es keine Fließkomma-Summationsfehler, und jede
 * Funktion ist mit festen Eingaben testbar (siehe backend/test/billing.test.ts).
 */

/**
 * Rechnerischer Ersatzwert, wenn für einen Zeitraum keine Minijob-Einstellung existiert (Cent).
 * Ergebnisse damit sind nur vorläufig: Die API meldet `minijobLimitMissing`, und ein
 * Monatsabschluss wird abgelehnt (MINIJOB_LIMIT_MISSING), bis eine Grenze hinterlegt ist.
 */
export const DEFAULT_LIMIT_CENTS = 55000;
/** Fallback-Stundensatz für Altdaten ohne eingefrorenen Satz (Cent). */
export const DEFAULT_HOURLY_RATE_CENTS = 1200;

/** Fachliche Grenzen für einen einzelnen Zeiteintrag. */
export const RULES = {
  MIN_WORK_MINUTES: 15,
  MAX_SPAN_MINUTES: 12 * 60,
  /** Summe der Arbeitszeit aller Einträge eines Tages (Tag = Datum des Beginns) */
  MAX_DAY_WORK_MINUTES: 12 * 60,
  MAX_BREAK_MINUTES: 480,
  MAX_BACKDATE_MONTHS: 1
} as const;

/** "HH:mm" oder "HH:mm:ss" → Minuten seit Mitternacht. */
export const timeToMinutes = (time: string | null | undefined): number => {
  if (!time) return 0;
  const [h = 0, m = 0] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Dauer von Start bis Ende in Minuten; Ende ≤ Start zählt als Nachtschicht über Mitternacht. */
export const spanMinutes = (startTime: string, endTime: string): number => {
  let span = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (span < 0) span += 24 * 60;
  return span;
};

/** Reine Arbeitszeit in Minuten (Dauer minus Pause, nie negativ). */
export const workMinutes = (startTime: string, endTime: string, breakMinutes: number | null = 0): number =>
  Math.max(0, spanMinutes(startTime, endTime) - (Number(breakMinutes) || 0));

/** Verdienst in Cent, kaufmännisch auf ganze Cent gerundet. */
export const earningsCents = (minutes: number, hourlyRateCents: number): number =>
  Math.round((minutes * hourlyRateCents) / 60);

/** Euro (Zahl oder Zahl-String) → ganze Cent. */
export const toCents = (euros: number | string): number => Math.round(Number(euros) * 100);

/** Ganze Cent → Euro als Zahl mit höchstens 2 Nachkommastellen. */
export const toEuros = (cents: number): number => Math.round(cents) / 100;

/**
 * Pause bestimmen: nur wenn gar kein Wert übergeben wurde, gilt der Standard.
 * Ein ausdrückliches 0 bleibt 0 (früher: `0 || 30` → 30). Für weitere Einträge am selben Tag übergibt der
 * Aufrufer 0 als Standard (die Pause liegt zwischen den Einträgen).
 */
export const resolveBreakMinutes = (value: number | string | null | undefined, defaultMinutes = 30): number =>
  value === undefined || value === null || value === '' ? defaultMinutes : parseInt(String(value), 10);

/** Datum (YYYY-MM-DD) um n Monate verschieben, Tag wird bei kurzen Monaten gekürzt. */
export const addMonths = (dateString: string, months: number): string => {
  const [y = 1970, m = 1, d = 1] = dateString.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
};

/** Datum (YYYY-MM-DD) um n Tage verschieben. */
export const addDays = (dateString: string, days: number): string => {
  const [y = 1970, m = 1, d = 1] = dateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export interface EntryTimes {
  date?: string;
  startTime: string;
  endTime: string;
  breakMinutes: number | null;
}

/**
 * Serverseitige Fachregeln für einen Zeiteintrag.
 * @param ctx today = Berliner Kalendertag; checkDateWindow nur beim Anlegen
 * @returns Fehlermeldungen (leer = gültig)
 */
export const validateEntryRules = (
  entry: EntryTimes,
  { today, checkDateWindow = false }: { today: string; checkDateWindow?: boolean }
): string[] => {
  const errors: string[] = [];
  const span = spanMinutes(entry.startTime, entry.endTime);
  const breakMinutes = entry.breakMinutes ?? 0;

  if (span === 0) {
    errors.push('Start- und Endzeit dürfen nicht gleich sein');
  } else {
    if (span > RULES.MAX_SPAN_MINUTES) {
      errors.push('Arbeitszeit darf 12 Stunden nicht überschreiten');
    }
    if (span - breakMinutes < RULES.MIN_WORK_MINUTES) {
      errors.push('Mindestarbeitszeit beträgt 15 Minuten');
    }
  }
  if (breakMinutes < 0 || breakMinutes > RULES.MAX_BREAK_MINUTES) {
    errors.push('Pausendauer muss zwischen 0 und 480 Minuten liegen');
  }

  if (checkDateWindow && entry.date) {
    if (entry.date > today) {
      errors.push('Datum darf nicht in der Zukunft liegen');
    }
    if (entry.date < addMonths(today, -RULES.MAX_BACKDATE_MONTHS)) {
      errors.push('Datum darf nicht mehr als einen Monat zurückliegen');
    }
  }
  return errors;
};

export interface DayEntry {
  id?: number;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number | null;
}

const MINUTES_PER_DAY = 24 * 60;

/** Tag (YYYY-MM-DD) → fortlaufende Tagesnummer (UTC, ohne Sommerzeit-Effekte) */
const dayNumber = (date: string): number => {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/**
 * Zeitraum eines Eintrags in Minuten auf einer durchgehenden Zeitachse: [Beginn, Ende).
 * Ende ≤ Beginn = Nachtschicht, das Ende liegt am Folgetag.
 */
export const entryInterval = (entry: DayEntry): [number, number] => {
  const start = dayNumber(entry.date) * MINUTES_PER_DAY + timeToMinutes(entry.startTime);
  return [start, start + spanMinutes(entry.startTime, entry.endTime)];
};

/**
 * Erster Eintrag, mit dem sich `entry` zeitlich überschneidet (auch über Mitternacht, z. B. Nachtschicht am
 * Vortag), sonst null. Direkt aneinander anschließende Einträge (Ende 13:00, Beginn 13:00) sind erlaubt.
 * Ein Eintrag mit derselben `id` (der bearbeitete selbst) wird übersprungen.
 */
export const findOverlap = <T extends DayEntry>(entry: DayEntry, others: readonly T[]): T | null => {
  const [start, end] = entryInterval(entry);
  for (const other of others) {
    if (entry.id !== undefined && other.id === entry.id) continue;
    const [otherStart, otherEnd] = entryInterval(other);
    if (start < otherEnd && otherStart < end) return other;
  }
  return null;
};

/**
 * Regeln für den ganzen Tag: Die Arbeitszeit aller Einträge mit demselben Datum (inkl. `entry`) darf
 * MAX_DAY_WORK_MINUTES nicht überschreiten.
 * @returns Fehlermeldungen (leer = gültig)
 */
export const validateDayRules = (entry: DayEntry, sameDay: readonly DayEntry[]): string[] => {
  const others = sameDay.filter((e) => e.date === entry.date && (entry.id === undefined || e.id !== entry.id));
  const before = others.reduce((sum, e) => sum + workMinutes(e.startTime, e.endTime, e.breakMinutes), 0);
  const total = before + workMinutes(entry.startTime, entry.endTime, entry.breakMinutes);
  if (total > RULES.MAX_DAY_WORK_MINUTES) {
    const hours = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
    return [`Arbeitszeit pro Tag darf 12 Stunden nicht überschreiten (an diesem Tag bereits erfasst: ${hours(before)} Std.)`];
  }
  return [];
};

export interface LimitSetting {
  monthlyLimit: number | string;
  validFrom: string;
  validUntil: string | null;
}

/** Minijob-Einstellung, die an einem Stichtag galt (bei Überschneidung die jüngste), sonst null. */
const findLimitSetting = <T extends LimitSetting>(settings: readonly T[], date: string): T | null => {
  let best: T | null = null;
  for (const s of settings) {
    if (s.validFrom <= date && (!s.validUntil || s.validUntil >= date)) {
      if (!best || s.validFrom > best.validFrom) best = s;
    }
  }
  return best;
};

/** Ist zum Stichtag eine Minijob-Grenze hinterlegt? */
export const hasLimitForDate = (settings: readonly LimitSetting[], date: string): boolean =>
  findLimitSetting(settings, date) !== null;

/** Minijob-Grenze (Cent), die an einem Stichtag galt; ohne Einstellung der Ersatzwert. */
export const limitCentsForDate = (settings: readonly LimitSetting[], date: string): number => {
  const best = findLimitSetting(settings, date);
  return best ? toCents(best.monthlyLimit) : DEFAULT_LIMIT_CENTS;
};

export interface CarryRow {
  earningsCents: number;
  limitCents: number;
  carryInCents: number;
  actualCents: number;
  paidCents: number;
  carryOutCents: number;
}

/**
 * Verrechnet Perioden der Reihe nach mit Übertrag: Was über der Grenze liegt,
 * wird in die nächste Periode übertragen.
 * @param periods chronologisch
 */
export const foldCarry = (periods: readonly { earningsCents: number; limitCents: number }[]): CarryRow[] => {
  let carryIn = 0;
  return periods.map((p) => {
    const actual = p.earningsCents + carryIn;
    const paid = Math.min(actual, p.limitCents);
    const carryOut = Math.max(0, actual - p.limitCents);
    const row = {
      earningsCents: p.earningsCents,
      limitCents: p.limitCents,
      carryInCents: carryIn,
      actualCents: actual,
      paidCents: paid,
      carryOutCents: carryOut
    };
    carryIn = carryOut;
    return row;
  });
};
