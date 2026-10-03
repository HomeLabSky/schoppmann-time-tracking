/**
 * Reine Rechenlogik der Abrechnung (ohne Datenbank, ohne Zeitabhängigkeit).
 *
 * Alle Beträge werden in ganzen Cent gerechnet; erst die API-Antwort wandelt
 * in Euro um. Dadurch gibt es keine Fließkomma-Summationsfehler, und jede
 * Funktion ist mit festen Eingaben testbar (siehe backend/test/billing.test.js).
 */

/**
 * Rechnerischer Ersatzwert, wenn für einen Zeitraum keine Minijob-Einstellung existiert (Cent).
 * Ergebnisse damit sind nur vorläufig: Die API meldet `minijobLimitMissing`, und ein
 * Monatsabschluss wird abgelehnt (MINIJOB_LIMIT_MISSING), bis eine Grenze hinterlegt ist.
 */
const DEFAULT_LIMIT_CENTS = 55000;
/** Fallback-Stundensatz für Altdaten ohne eingefrorenen Satz (Cent). */
const DEFAULT_HOURLY_RATE_CENTS = 1200;

/** Fachliche Grenzen für einen einzelnen Zeiteintrag. */
const RULES = {
  MIN_WORK_MINUTES: 15,
  MAX_SPAN_MINUTES: 12 * 60,
  MAX_BREAK_MINUTES: 480,
  MAX_BACKDATE_MONTHS: 1
};

/** "HH:mm" oder "HH:mm:ss" → Minuten seit Mitternacht. */
const timeToMinutes = (time) => {
  if (!time) return 0;
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Dauer von Start bis Ende in Minuten; Ende ≤ Start zählt als Nachtschicht über Mitternacht. */
const spanMinutes = (startTime, endTime) => {
  let span = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (span < 0) span += 24 * 60;
  return span;
};

/** Reine Arbeitszeit in Minuten (Dauer minus Pause, nie negativ). */
const workMinutes = (startTime, endTime, breakMinutes = 0) =>
  Math.max(0, spanMinutes(startTime, endTime) - (Number(breakMinutes) || 0));

/** Verdienst in Cent, kaufmännisch auf ganze Cent gerundet. */
const earningsCents = (minutes, hourlyRateCents) =>
  Math.round((minutes * hourlyRateCents) / 60);

/** Euro (Zahl, String oder Decimal) → ganze Cent. */
const toCents = (euros) => Math.round(Number(euros) * 100);

/** Ganze Cent → Euro als Zahl mit höchstens 2 Nachkommastellen. */
const toEuros = (cents) => Math.round(cents) / 100;

/**
 * Pause bestimmen: nur wenn gar kein Wert übergeben wurde, gilt der Standard.
 * Ein ausdrückliches 0 bleibt 0 (früher: `0 || 30` → 30).
 */
const resolveBreakMinutes = (value, defaultMinutes = 30) =>
  value === undefined || value === null || value === '' ? defaultMinutes : parseInt(value, 10);

/** Datum (YYYY-MM-DD) um n Monate verschieben, Tag wird bei kurzen Monaten gekürzt. */
const addMonths = (dateString, months) => {
  const [y, m, d] = dateString.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().split('T')[0];
};

/**
 * Serverseitige Fachregeln für einen Zeiteintrag.
 * @param {{date?:string,startTime:string,endTime:string,breakMinutes:number}} entry
 * @param {{today:string, checkDateWindow?:boolean}} ctx today = Berliner Kalendertag
 * @returns {string[]} Fehlermeldungen (leer = gültig)
 */
const validateEntryRules = (entry, { today, checkDateWindow = false }) => {
  const errors = [];
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

/**
 * Minijob-Einstellung, die an einem Stichtag galt (bei Überschneidung die jüngste), sonst null.
 * @param {Array<{monthlyLimit:number|string, validFrom:string, validUntil:string|null}>} settings
 * @param {string} date YYYY-MM-DD
 */
const findLimitSetting = (settings, date) => {
  let best = null;
  for (const s of settings) {
    if (s.validFrom <= date && (!s.validUntil || s.validUntil >= date)) {
      if (!best || s.validFrom > best.validFrom) best = s;
    }
  }
  return best;
};

/** Ist zum Stichtag eine Minijob-Grenze hinterlegt? */
const hasLimitForDate = (settings, date) => findLimitSetting(settings, date) !== null;

/**
 * Minijob-Grenze (Cent), die an einem Stichtag galt; ohne Einstellung der Ersatzwert.
 * @param {Array<{monthlyLimit:number|string, validFrom:string, validUntil:string|null}>} settings
 * @param {string} date YYYY-MM-DD
 */
const limitCentsForDate = (settings, date) => {
  const best = findLimitSetting(settings, date);
  return best ? toCents(best.monthlyLimit) : DEFAULT_LIMIT_CENTS;
};

/**
 * Verrechnet Perioden der Reihe nach mit Übertrag: Was über der Grenze liegt,
 * wird in die nächste Periode übertragen.
 * @param {Array<{earningsCents:number, limitCents:number}>} periods chronologisch
 * @returns {Array<{earningsCents:number, limitCents:number, carryInCents:number,
 *   actualCents:number, paidCents:number, carryOutCents:number}>}
 */
const foldCarry = (periods) => {
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

module.exports = {
  DEFAULT_LIMIT_CENTS,
  DEFAULT_HOURLY_RATE_CENTS,
  RULES,
  timeToMinutes,
  spanMinutes,
  workMinutes,
  earningsCents,
  toCents,
  toEuros,
  resolveBreakMinutes,
  addMonths,
  validateEntryRules,
  hasLimitForDate,
  limitCentsForDate,
  foldCarry
};
