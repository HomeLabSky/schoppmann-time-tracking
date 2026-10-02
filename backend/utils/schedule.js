/**
 * Millisekunden bis zur nächsten Uhrzeit "HH:MM" (Ortszeit des Prozesses; im Container per TZ gesetzt).
 * Ist die Uhrzeit heute schon erreicht oder vorbei, gilt morgen.
 * @param {Date} now
 * @param {string} time z. B. "02:30"
 */
const msUntilNext = (now, time) => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(time).trim());
  if (!match) {
    throw new Error(`Ungültige Uhrzeit "${time}" (erwartet HH:MM, z. B. 02:30)`);
  }
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]), 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
};

module.exports = { msUntilNext };
