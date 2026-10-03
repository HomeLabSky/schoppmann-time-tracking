import { eq } from 'drizzle-orm';
import config from '../config';
import { db } from '../db/client';
import { loginThrottles } from '../db/schema';
import { AppError } from '../lib/errors';

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
export class LoginThrottleService {
  /** Wirft ACCOUNT_LOCKED (429, mit retryAfter in Sekunden), solange die Adresse gesperrt ist. */
  static async assertNotLocked(email: string, now: Date = new Date()): Promise<void> {
    const row = db().select().from(loginThrottles).where(eq(loginThrottles.email, email)).get();
    if (!row || !row.lockedUntil || row.lockedUntil <= now) return;
    const retryAfter = Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000);
    throw new AppError(
      'ACCOUNT_LOCKED',
      `Zu viele fehlgeschlagene Anmeldungen. Bitte in ${Math.ceil(retryAfter / 60)} Minute(n) erneut versuchen ` +
      'oder einen Administrator bitten, das Passwort zurückzusetzen.',
      { extra: { retryAfter } }
    );
  }

  /** Zählt einen Fehlversuch. */
  static async recordFailure(
    email: string,
    now: Date = new Date()
  ): Promise<{ failures: number; lockedUntil: Date | null; lockedNow: boolean }> {
    const { threshold, minutes } = config.auth.lock;
    const row = db().select().from(loginThrottles).where(eq(loginThrottles.email, email)).get();

    const stale = row?.lastFailureAt && now.getTime() - row.lastFailureAt.getTime() > FAILURE_MEMORY_MS;
    const failures = (stale || !row ? 0 : row.failures) + 1;

    let lockedUntil = row?.lockedUntil && row.lockedUntil > now ? row.lockedUntil : null;
    let lockedNow = false;
    if (failures % threshold === 0) {
      const series = failures / threshold;
      const lockMs = Math.min(minutes * MINUTE_MS * 2 ** (series - 1), MAX_LOCK_MS);
      lockedUntil = new Date(now.getTime() + lockMs);
      lockedNow = true;
    }

    db().insert(loginThrottles)
      .values({ email, failures, lastFailureAt: now, lockedUntil })
      .onConflictDoUpdate({ target: loginThrottles.email, set: { failures, lastFailureAt: now, lockedUntil } })
      .run();
    return { failures, lockedUntil, lockedNow };
  }

  /** Erfolgreiche Anmeldung oder Passwort-Reset: Zähler und Sperre aufheben. */
  static async reset(email: string): Promise<void> {
    db().delete(loginThrottles).where(eq(loginThrottles.email, email)).run();
  }
}

export default LoginThrottleService;
