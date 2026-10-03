const { LoginThrottle } = require('../models');
const config = require('../config');
const { AppError } = require('../lib/errors');

const MINUTE_MS = 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * MINUTE_MS;
// Fehlversuche verfallen, wenn so lange keiner dazukam
const FAILURE_MEMORY_MS = 24 * 60 * MINUTE_MS;

/**
 * Konto-Sperre nach wiederholten Fehlversuchen (ergänzt die Begrenzung pro IP, die hinter einem Proxy
 * oder bei verteilten Angriffen nicht reicht).
 *
 * Nach `threshold` Fehlversuchen (Standard 5) ist die Anmeldung für `minutes` Minuten gesperrt (Standard 15);
 * jede weitere Serie verdoppelt die Sperre (30, 60 … höchstens 24 h). Während der Sperre wird das Passwort
 * gar nicht erst geprüft. Eine erfolgreiche Anmeldung oder ein Passwort-Reset setzt den Zähler zurück.
 *
 * Gezählt wird je normalisierter E-Mail-Adresse, auch für nicht existierende Konten – die Sperre verrät
 * also nicht, ob es ein Konto gibt.
 */
class LoginThrottleService {
  /** Wirft ACCOUNT_LOCKED (429, mit retryAfter in Sekunden), solange die Adresse gesperrt ist. */
  static async assertNotLocked(email, now = new Date()) {
    const row = await LoginThrottle.findByPk(email);
    if (!row || !row.lockedUntil || row.lockedUntil <= now) return;
    const retryAfter = Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError(
      'ACCOUNT_LOCKED',
      `Zu viele fehlgeschlagene Anmeldungen. Bitte in ${Math.ceil(retryAfter / 60)} Minute(n) erneut versuchen ` +
      'oder einen Administrator bitten, das Passwort zurückzusetzen.',
      { extra: { retryAfter } }
    );
  }

  /**
   * Zählt einen Fehlversuch.
   * @returns {Promise<{failures:number, lockedUntil:Date|null, lockedNow:boolean}>}
   */
  static async recordFailure(email, now = new Date()) {
    const { threshold, minutes } = config.auth.lock;
    const [row] = await LoginThrottle.findOrCreate({ where: { email }, defaults: { failures: 0 } });

    const stale = row.lastFailureAt && now.getTime() - row.lastFailureAt.getTime() > FAILURE_MEMORY_MS;
    const failures = (stale ? 0 : row.failures) + 1;

    let lockedUntil = row.lockedUntil && row.lockedUntil > now ? row.lockedUntil : null;
    let lockedNow = false;
    if (failures % threshold === 0) {
      const series = failures / threshold;
      const lockMs = Math.min(minutes * MINUTE_MS * 2 ** (series - 1), MAX_LOCK_MS);
      lockedUntil = new Date(now.getTime() + lockMs);
      lockedNow = true;
    }

    await row.update({ failures, lastFailureAt: now, lockedUntil });
    return { failures, lockedUntil, lockedNow };
  }

  /** Erfolgreiche Anmeldung oder Passwort-Reset: Zähler und Sperre aufheben. */
  static async reset(email) {
    await LoginThrottle.destroy({ where: { email } });
  }
}

module.exports = LoginThrottleService;
