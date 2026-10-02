/**
 * Datum "heute" in der Zeitzone des Betriebs (Europe/Berlin).
 *
 * `new Date().toISOString().split('T')[0]` liefert das UTC-Datum – zwischen
 * 0:00 und 1:00/2:00 Uhr Ortszeit wäre das noch "gestern". Alle Fachregeln
 * ("nicht in der Zukunft", aktuelle Periode, gültige Minijob-Grenze) müssen
 * mit dem Berliner Kalendertag arbeiten.
 */
const TIME_ZONE = 'Europe/Berlin';

const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** @param {Date} [now] @returns {string} YYYY-MM-DD */
const todayString = (now = new Date()) => formatter.format(now);

module.exports = { todayString, TIME_ZONE };
