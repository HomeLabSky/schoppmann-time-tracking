const UserService = require('./userService');
const SessionService = require('./sessionService');
const AuditService = require('./auditService');
const LoginThrottleService = require('./loginThrottle');
const logger = require('../lib/logger');

const clip = (value, max) => (value ? String(value).slice(0, max) : undefined);

/** Protokolleintrag für Anmelde-Ereignisse; ein Fehler beim Protokollieren darf die Anmeldung nicht verhindern. */
const audit = (entry) =>
  AuditService.record(entry).catch((error) => logger.error({ err: error, action: entry.action }, 'Audit-Eintrag fehlgeschlagen'));

/**
 * Anmeldung für Web (Cookies) und App (Bearer-Token) – gleiche Regeln, gleiche Sitzungs-Tabelle:
 * Konto-Sperre nach Fehlversuchen, Protokoll aller Anmeldungen und Fehlversuche, Sitzungen mit Rotation.
 * Die Routen entscheiden nur, ob die Tokens als Cookies oder im Body ausgeliefert werden.
 */
class AuthService {
  /**
   * @param {string} email normalisierte E-Mail-Adresse
   * @param {string} password
   * @param {{ip?:string, userAgent?:string, clientType:'web'|'app', deviceName?:string}} context
   * @returns {Promise<{user:Object, session:{sid:string, accessToken:string, refreshToken:string, refreshExpiresAt:Date}}>}
   * @throws {AppError} ACCOUNT_LOCKED, INVALID_CREDENTIALS, USER_INACTIVE
   */
  static async login(email, password, context) {
    await LoginThrottleService.assertNotLocked(email);

    let user;
    try {
      ({ user } = await UserService.authenticateUser(email, password));
    } catch (error) {
      if (error.code === 'INVALID_CREDENTIALS' || error.code === 'USER_INACTIVE') {
        await this.recordFailedLogin(email, error.code, context);
      }
      throw error;
    }

    await LoginThrottleService.reset(email);
    const session = await SessionService.createSession(user, context);
    await audit({
      actor: { id: user.id, email: user.email },
      action: 'auth.login',
      entityType: 'Session',
      targetUserId: user.id,
      meta: { ip: context.ip, client: context.clientType, ...(context.deviceName ? { device: clip(context.deviceName, 100) } : {}) }
    });
    return { user, session };
  }

  /** Fehlversuch zählen (nur falsches Passwort/unbekannte Adresse) und protokollieren. */
  static async recordFailedLogin(email, reason, context) {
    const existing = await UserService.findUserByEmail(email, true).catch(() => null);
    const failure = reason === 'INVALID_CREDENTIALS' ? await LoginThrottleService.recordFailure(email) : null;

    await audit({
      actor: null,
      action: 'auth.login_failed',
      entityType: 'Session',
      targetUserId: existing ? existing.id : null,
      meta: { email: clip(email, 255), reason, ip: context.ip, client: context.clientType }
    });
    if (failure && failure.lockedNow) {
      await audit({
        actor: null,
        action: 'auth.account_locked',
        entityType: 'Session',
        targetUserId: existing ? existing.id : null,
        meta: { email: clip(email, 255), failures: failure.failures, lockedUntil: failure.lockedUntil.toISOString(), ip: context.ip }
      });
      logger.warn({ userId: existing ? existing.id : null, failures: failure.failures }, 'Anmeldung nach Fehlversuchen gesperrt');
    }
  }

  /** Selbstregistrierung: Konto anlegen und direkt anmelden (Web). */
  static async register({ email, password, name }, context) {
    // Rolle bewusst NICHT aus dem Body übernehmen → immer Standardrolle
    const user = await UserService.createUser({ email, password, name });
    const session = await SessionService.createSession(user, context);
    await audit({
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
   * @param {string} refreshToken
   * @param {{ip?:string, userAgent?:string, clientType:'web'|'app'}} context
   */
  static async refresh(refreshToken, context) {
    try {
      return await SessionService.rotate(refreshToken, { clientType: context.clientType });
    } catch (error) {
      if (error.code === 'REFRESH_TOKEN_REUSED') {
        await audit({
          actor: null,
          action: 'auth.session_reuse_detected',
          entityType: 'Session',
          targetUserId: error.userId ?? null,
          meta: { ip: context.ip, userAgent: clip(context.userAgent, 255), client: context.clientType }
        });
        logger.warn({ userId: error.userId }, 'Erneuerungs-Token wiederverwendet – Sitzung beendet');
      }
      throw error;
    }
  }

  /**
   * Abmelden: beendet die Sitzung, zu der die Tokens gehören. Schlägt nie fehl (Abmelden muss immer gehen).
   * @param {{refreshToken?:string, accessToken?:string}} tokens
   */
  static async logout(tokens, context) {
    try {
      const ended = await SessionService.logout(tokens);
      if (ended) {
        await audit({
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

module.exports = AuthService;
