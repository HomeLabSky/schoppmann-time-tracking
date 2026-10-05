import type { ClientType } from '../db/schema';
import { isAppError } from '../lib/errors';
import logger from '../lib/logger';
import type { SafeUser } from '../models/user';
import { AuditService, type AuditEntryInput } from './auditService';
import { LoginThrottleService } from './loginThrottle';
import { SessionService, type IssuedSession } from './sessionService';
import { UserService } from './userService';

const clip = (value: string | null | undefined, max: number): string | undefined => (value ? value.slice(0, max) : undefined);

/** Protokolleintrag für Anmelde-Ereignisse; ein Fehler beim Protokollieren darf die Anmeldung nicht verhindern. */
const audit = (entry: AuditEntryInput): void => {
  try {
    AuditService.record(entry);
  } catch (error) {
    logger.error({ err: error, action: entry.action }, 'Audit-Eintrag fehlgeschlagen');
  }
};

export interface AuthContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
  clientType: ClientType;
  deviceName?: string | undefined;
}

/**
 * Anmeldung für Web (Cookies) und App (Bearer-Token) – gleiche Regeln, gleiche Sitzungs-Tabelle:
 * Konto-Sperre nach Fehlversuchen, Protokoll aller Anmeldungen und Fehlversuche, Sitzungen mit Rotation.
 * Die Routen entscheiden nur, ob die Tokens als Cookies oder im Body ausgeliefert werden.
 */
export class AuthService {
  /**
   * @param email normalisierte E-Mail-Adresse
   * @throws AppError ACCOUNT_LOCKED, INVALID_CREDENTIALS, USER_INACTIVE
   */
  static async login(email: string, password: string, context: AuthContext): Promise<{ user: SafeUser; session: IssuedSession }> {
    await LoginThrottleService.assertNotLocked(email);

    let user: SafeUser;
    try {
      ({ user } = await UserService.authenticateUser(email, password));
    } catch (error) {
      if (isAppError(error) && (error.code === 'INVALID_CREDENTIALS' || error.code === 'USER_INACTIVE')) {
        await this.recordFailedLogin(email, error.code, context);
      }
      throw error;
    }

    await LoginThrottleService.reset(email);
    const session = await SessionService.createSession(user, context);
    audit({
      actor: { id: user.id, email: user.email },
      action: 'auth.login',
      entityType: 'Session',
      targetUserId: user.id,
      meta: { ip: context.ip, client: context.clientType, ...(context.deviceName ? { device: clip(context.deviceName, 100) } : {}) }
    });
    return { user, session };
  }

  /** Fehlversuch zählen (nur falsches Passwort/unbekannte Adresse) und protokollieren. */
  static async recordFailedLogin(email: string, reason: string, context: AuthContext): Promise<void> {
    const existing = await UserService.findUserByEmail(email, true).catch(() => null);
    const failure = reason === 'INVALID_CREDENTIALS' ? await LoginThrottleService.recordFailure(email) : null;

    audit({
      actor: null,
      action: 'auth.login_failed',
      entityType: 'Session',
      targetUserId: existing ? existing.id : null,
      meta: { email: clip(email, 255), reason, ip: context.ip, client: context.clientType }
    });
    if (failure && failure.lockedNow) {
      audit({
        actor: null,
        action: 'auth.account_locked',
        entityType: 'Session',
        targetUserId: existing ? existing.id : null,
        meta: { email: clip(email, 255), failures: failure.failures, lockedUntil: failure.lockedUntil?.toISOString(), ip: context.ip }
      });
      logger.warn({ userId: existing ? existing.id : null, failures: failure.failures }, 'Anmeldung nach Fehlversuchen gesperrt');
    }
  }

  /** Selbstregistrierung: Konto anlegen und direkt anmelden (Web). */
  static async register(
    { email, password, name }: { email: string; password: string; name: string },
    context: AuthContext
  ): Promise<{ user: SafeUser; session: IssuedSession }> {
    // Rolle bewusst NICHT aus dem Body übernehmen → immer Standardrolle
    const user = await UserService.createUser({ email, password, name });
    const session = await SessionService.createSession(user, context);
    audit({
      actor: { id: user.id, email: user.email },
      action: 'auth.login',
      entityType: 'Session',
      targetUserId: user.id,
      meta: { via: 'registration', ip: context.ip, client: context.clientType }
    });
    return { user, session };
  }

  /**
   * Erneuerungs-Token tauschen (Rotation). Erkannte Wiederverwendung wird protokolliert.
   */
  static async refresh(refreshToken: string, context: AuthContext) {
    try {
      return await SessionService.rotate(refreshToken, { clientType: context.clientType });
    } catch (error) {
      if (error instanceof Error && 'userId' in error && isAppError(error) && error.code === 'REFRESH_TOKEN_REUSED') {
        audit({
          actor: null,
          action: 'auth.session_reuse_detected',
          entityType: 'Session',
          targetUserId: (error.userId as number | undefined) ?? null,
          meta: { ip: context.ip, userAgent: clip(context.userAgent, 255), client: context.clientType }
        });
        logger.warn({ userId: error.userId }, 'Erneuerungs-Token wiederverwendet – Sitzung beendet');
      }
      throw error;
    }
  }

  /**
   * Abmelden: beendet die Sitzung, zu der die Tokens gehören. Schlägt nie fehl (Abmelden muss immer gehen).
   */
  static async logout(
    tokens: { refreshToken?: string | undefined; accessToken?: string | null | undefined },
    context: { ip?: string | undefined; clientType: ClientType }
  ) {
    try {
      const ended = await SessionService.logout(tokens);
      if (ended) {
        audit({
          actor: { id: ended.userId, email: ended.email },
          action: 'auth.logout',
          entityType: 'Session',
          targetUserId: ended.userId,
          meta: { ip: context.ip, client: context.clientType }
        });
      }
      return ended;
    } catch (error) {
      logger.error({ err: error }, 'Abmelden fehlgeschlagen');
      return null;
    }
  }
}

export default AuthService;
