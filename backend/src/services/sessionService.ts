import crypto from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { and, eq, isNull, lt, ne, or } from 'drizzle-orm';
import config from '../config';
import { db } from '../db/client';
import { sessions, users, type ClientType } from '../db/schema';
import { AppError, type ErrorCode } from '../lib/errors';
import { toSafeUser, type SafeUser } from '../models/user';

const ISSUER = 'schoppmann-timetracking';
const AUDIENCE = 'schoppmann-users';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sitzungsfehler: immer 401 (auch USER_INACTIVE – die Sitzung ist damit beendet), außer
 * REFRESH_IN_PROGRESS = 409 (zweiter Tab erneuert gerade; der Client versucht es kurz darauf erneut).
 */
export class SessionError extends AppError {
  /** Bei REFRESH_TOKEN_REUSED: betroffener Benutzer (für das Protokoll) */
  userId?: number;

  constructor(code: ErrorCode, message: string) {
    super(code, message, { status: code === 'REFRESH_IN_PROGRESS' ? 409 : 401 });
    this.name = 'SessionError';
  }
}

/** Laufzeiten je Anmeldeweg: Web (Cookies) kürzer, App (sicherer Gerätespeicher) länger */
const lifetimes = (clientType: ClientType) => (clientType === 'app' ? config.auth.app : config.auth);

// HMAC mit JWT_REFRESH_SECRET: ein Datenbank-Abzug allein reicht nicht, um Tokens zu prüfen oder zu erzeugen.
const hashSecret = (secret: string): string =>
  crypto.createHmac('sha256', config.jwt.refreshSecret).update(secret).digest('hex');

const safeEqual = (a: unknown, b: unknown): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const newSecret = (): string => crypto.randomBytes(32).toString('base64url');

/** Erneuerungs-Token = "<Sitzungs-ID>.<Geheimnis>" */
const parseRefreshToken = (raw: unknown): { sid: string; secret: string } | null => {
  if (typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot < 1 || dot === raw.length - 1) return null;
  return { sid: raw.slice(0, dot), secret: raw.slice(dot + 1) };
};

interface AccessPayload extends JwtPayload {
  userId: number;
  sid: string;
}

const signAccessToken = (userId: number, sid: string): string =>
  jwt.sign({ userId, sid }, config.jwt.secret, {
    expiresIn: config.auth.accessTtlSeconds,
    issuer: ISSUER,
    audience: AUDIENCE
  });

const clip = (value: string | null | undefined, max: number): string | null => (value ? value.slice(0, max) : null);

export interface SessionContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
  clientType?: ClientType;
  deviceName?: string | undefined;
}

export interface IssuedSession {
  sid: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const findSession = (sid: string) => db().select().from(sessions).where(eq(sessions.id, sid)).get();

/**
 * Sitzungsverwaltung: Anmeldung, Token-Erneuerung mit Rotation und Wiederverwendungs-Erkennung,
 * Widerruf. Zugriffs-Tokens (JWT, kurz) enthalten nur Benutzer- und Sitzungs-ID; Rolle und Status
 * werden bei jeder Anfrage aus der Datenbank gelesen – Sperren und Rollenänderungen wirken sofort.
 */
export class SessionService {
  /** Legt eine Sitzung an (bei Login/Registrierung). */
  static async createSession(user: { id: number }, context: SessionContext = {}): Promise<IssuedSession> {
    const clientType = context.clientType || 'web';
    if (clientType !== 'web' && clientType !== 'app') throw new Error(`Unbekannter Anmeldeweg: ${String(clientType)}`);
    const { refreshTtlDays, sessionMaxDays } = lifetimes(clientType);

    const now = new Date();
    const sid = crypto.randomUUID();
    const secret = newSecret();
    const expiresAt = new Date(now.getTime() + refreshTtlDays * DAY_MS);

    db().insert(sessions).values({
      id: sid,
      userId: user.id,
      clientType,
      deviceName: clip(context.deviceName, 100),
      refreshHash: hashSecret(secret),
      lastUsedAt: now,
      expiresAt,
      absoluteExpiresAt: new Date(now.getTime() + sessionMaxDays * DAY_MS),
      ip: clip(context.ip, 64),
      userAgent: clip(context.userAgent, 255),
      createdAt: now,
      updatedAt: now
    }).run();

    // Aufräumen beiläufig: abgelaufene/gesperrte Sitzungen nach einer Woche entfernen
    this.purgeOld();

    return { sid, accessToken: signAccessToken(user.id, sid), refreshToken: `${sid}.${secret}`, refreshExpiresAt: expiresAt };
  }

  /**
   * Tauscht ein Erneuerungs-Token gegen ein neues Paar (Rotation).
   * Ein Token gilt nur auf dem Weg, auf dem es ausgegeben wurde (Web-Cookie bzw. App-Body): Ein aus dem Browser
   * entwendetes Cookie lässt sich nicht als App-Token einsetzen und umgekehrt.
   * Wirft SessionError mit: INVALID_REFRESH_TOKEN, USER_INACTIVE, REFRESH_IN_PROGRESS, REFRESH_TOKEN_REUSED.
   */
  static async rotate(
    rawToken: unknown,
    { clientType = 'web' }: { clientType?: ClientType } = {}
  ): Promise<IssuedSession & { user: SafeUser }> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) throw new SessionError('INVALID_REFRESH_TOKEN', 'Ungültiges Erneuerungs-Token');

    const session = findSession(parsed.sid);
    if (!session || session.revokedAt) {
      throw new SessionError('INVALID_REFRESH_TOKEN', 'Sitzung ist beendet');
    }
    if ((session.clientType || 'web') !== clientType) {
      throw new SessionError('INVALID_REFRESH_TOKEN', 'Ungültiges Erneuerungs-Token');
    }

    const now = new Date();
    if (now > session.expiresAt || now > session.absoluteExpiresAt) {
      this.revokeSync(session.id, 'expired');
      throw new SessionError('INVALID_REFRESH_TOKEN', 'Sitzung ist abgelaufen');
    }

    const presented = hashSecret(parsed.secret);
    if (!safeEqual(presented, session.refreshHash)) {
      if (session.previousHash && safeEqual(presented, session.previousHash)) {
        // Zwei Tabs erneuern fast gleichzeitig: das zuletzt rotierte Token ist noch "in Arbeit"
        const ageMs = now.getTime() - (session.rotatedAt?.getTime() ?? 0);
        if (ageMs <= config.auth.refreshGraceSeconds * 1000) {
          throw new SessionError('REFRESH_IN_PROGRESS', 'Erneuerung läuft bereits, bitte erneut versuchen');
        }
        // Ein bereits ausgetauschtes Token taucht später wieder auf: vermutlich gestohlen → Sitzung sperren
        this.revokeSync(session.id, 'reuse_detected');
        const error = new SessionError('REFRESH_TOKEN_REUSED', 'Das Erneuerungs-Token wurde bereits verwendet. Aus Sicherheitsgründen wurde die Sitzung beendet.');
        error.userId = session.userId;
        throw error;
      }
      throw new SessionError('INVALID_REFRESH_TOKEN', 'Ungültiges Erneuerungs-Token');
    }

    const user = db().select().from(users).where(eq(users.id, session.userId)).get();
    if (!user || !user.isActive) {
      this.revokeSync(session.id, 'user_inactive');
      throw new SessionError('USER_INACTIVE', 'Benutzer ist deaktiviert');
    }

    const secret = newSecret();
    const nextExpiry = new Date(Math.min(
      now.getTime() + lifetimes(clientType).refreshTtlDays * DAY_MS,
      session.absoluteExpiresAt.getTime()
    ));
    // Bedingtes Update: gewinnt nur, wenn niemand sonst zwischenzeitlich rotiert hat
    const { changes } = db().update(sessions)
      .set({ previousHash: session.refreshHash, refreshHash: hashSecret(secret), rotatedAt: now, lastUsedAt: now, expiresAt: nextExpiry })
      .where(and(eq(sessions.id, session.id), eq(sessions.refreshHash, session.refreshHash), isNull(sessions.revokedAt)))
      .run();
    if (changes !== 1) {
      throw new SessionError('REFRESH_IN_PROGRESS', 'Erneuerung läuft bereits, bitte erneut versuchen');
    }

    return {
      user: toSafeUser(user),
      sid: session.id,
      accessToken: signAccessToken(user.id, session.id),
      refreshToken: `${session.id}.${secret}`,
      refreshExpiresAt: nextExpiry
    };
  }

  /**
   * Prüft ein Zugriffs-Token und liefert den aktuellen Benutzer.
   * Wirft SessionError mit: TOKEN_EXPIRED, INVALID_TOKEN, SESSION_ENDED, USER_INACTIVE.
   */
  static async authenticate(accessToken: string): Promise<{ user: SafeUser; sid: string }> {
    let payload: AccessPayload;
    try {
      payload = jwt.verify(accessToken, config.jwt.secret, { issuer: ISSUER, audience: AUDIENCE }) as AccessPayload;
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new SessionError('TOKEN_EXPIRED', 'Zugriffs-Token abgelaufen');
      }
      throw new SessionError('INVALID_TOKEN', 'Ungültiger Token');
    }
    if (!payload.sid || !payload.userId) throw new SessionError('INVALID_TOKEN', 'Ungültiger Token');

    const session = findSession(payload.sid);
    if (!session || session.revokedAt || new Date() > session.absoluteExpiresAt || session.userId !== payload.userId) {
      throw new SessionError('SESSION_ENDED', 'Die Sitzung wurde beendet. Bitte erneut anmelden.');
    }

    const user = db().select().from(users).where(eq(users.id, payload.userId)).get();
    if (!user || !user.isActive) {
      throw new SessionError('USER_INACTIVE', 'Benutzer ist deaktiviert');
    }
    return { user: toSafeUser(user), sid: session.id };
  }

  /**
   * Meldet die Sitzung ab, zu der die mitgeschickten Tokens gehören (Cookies oder App-Tokens). Die Zugehörigkeit
   * muss belegt sein (passendes Erneuerungs-Token oder gültig signiertes – auch abgelaufenes – Zugriffs-Token),
   * damit niemand fremde Sitzungen beenden kann.
   * @returns null, wenn keine Sitzung zugeordnet werden konnte
   */
  static async logout(
    { refreshToken, accessToken }: { refreshToken?: string | undefined; accessToken?: string | null | undefined } = {}
  ): Promise<{ sid: string; userId: number; email: string | null } | null> {
    let sid: string | null = null;

    const parsed = parseRefreshToken(refreshToken);
    if (parsed) {
      const session = findSession(parsed.sid);
      if (session) {
        const presented = hashSecret(parsed.secret);
        if (safeEqual(presented, session.refreshHash) || (session.previousHash && safeEqual(presented, session.previousHash))) {
          sid = session.id;
        }
      }
    }
    if (!sid && accessToken) {
      try {
        const payload = jwt.verify(accessToken, config.jwt.secret, { issuer: ISSUER, audience: AUDIENCE, ignoreExpiration: true }) as AccessPayload;
        sid = payload.sid || null;
      } catch {
        sid = null;
      }
    }
    if (!sid) return null;

    const session = findSession(sid);
    if (!session) return null;
    this.revokeSync(sid, 'logout');
    const user = db().select({ email: users.email }).from(users).where(eq(users.id, session.userId)).get();
    return { sid, userId: session.userId, email: user ? user.email : null };
  }

  /** Beendet eine Sitzung (idempotent, synchron – auch innerhalb von Transaktionen nutzbar). */
  static revokeSync(sid: string, reason = 'logout'): boolean {
    const { changes } = db().update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.id, sid), isNull(sessions.revokedAt)))
      .run();
    return changes > 0;
  }

  /** Beendet eine Sitzung (idempotent). */
  static async revoke(sid: string, reason = 'logout'): Promise<boolean> {
    return this.revokeSync(sid, reason);
  }

  /**
   * Beendet alle Sitzungen eines Benutzers (Passwortwechsel, Sperrung, Löschung), optional mit Ausnahme der
   * aktuellen Sitzung. Synchron – kann in der Transaktion der auslösenden Änderung laufen.
   * @returns Anzahl beendeter Sitzungen
   */
  static revokeAllForUser(userId: number, { exceptSid = null, reason = 'revoked' }: { exceptSid?: string | null; reason?: string } = {}): number {
    const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
    if (exceptSid) conditions.push(ne(sessions.id, exceptSid));
    return db().update(sessions).set({ revokedAt: new Date(), revokedReason: reason }).where(and(...conditions)).run().changes;
  }

  /** Löscht Sitzungen, die seit über einer Woche beendet oder abgelaufen sind. */
  static purgeOld(now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - 7 * DAY_MS);
    return db().delete(sessions)
      .where(or(lt(sessions.revokedAt, cutoff), lt(sessions.absoluteExpiresAt, cutoff)))
      .run().changes;
  }
}

export default SessionService;
