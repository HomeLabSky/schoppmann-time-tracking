const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { Session, User } = require('../models');
const config = require('../config');

const ISSUER = 'schoppmann-timetracking';
const AUDIENCE = 'schoppmann-users';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fehler mit maschinenlesbarem Code (wird von den Auth-Routen auf HTTP-Antworten abgebildet). */
class SessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
  }
}

// HMAC mit JWT_REFRESH_SECRET: ein Datenbank-Abzug allein reicht nicht, um Tokens zu prüfen oder zu erzeugen.
const hashSecret = (secret) => crypto.createHmac('sha256', config.jwt.refreshSecret).update(secret).digest('hex');

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const newSecret = () => crypto.randomBytes(32).toString('base64url');

/** Erneuerungs-Token = "<Sitzungs-ID>.<Geheimnis>" */
const parseRefreshToken = (raw) => {
  if (typeof raw !== 'string') return null;
  const dot = raw.indexOf('.');
  if (dot < 1 || dot === raw.length - 1) return null;
  return { sid: raw.slice(0, dot), secret: raw.slice(dot + 1) };
};

const signAccessToken = (userId, sid) =>
  jwt.sign({ userId, sid }, config.jwt.secret, {
    expiresIn: config.auth.accessTtlSeconds,
    issuer: ISSUER,
    audience: AUDIENCE
  });

const clip = (value, max) => (value ? String(value).slice(0, max) : null);

/**
 * Sitzungsverwaltung: Anmeldung, Token-Erneuerung mit Rotation und Wiederverwendungs-Erkennung,
 * Widerruf. Zugriffs-Tokens (JWT, kurz) enthalten nur Benutzer- und Sitzungs-ID; Rolle und Status
 * werden bei jeder Anfrage aus der Datenbank gelesen – Sperren und Rollenänderungen wirken sofort.
 */
class SessionService {
  /**
   * Legt eine Sitzung an (bei Login/Registrierung).
   * @param {Object} user Sequelize-User
   * @param {{ip?:string, userAgent?:string}} [context]
   * @returns {Promise<{sid:string, accessToken:string, refreshToken:string}>}
   */
  static async createSession(user, context = {}) {
    const now = new Date();
    const sid = crypto.randomUUID();
    const secret = newSecret();

    await Session.create({
      id: sid,
      userId: user.id,
      refreshHash: hashSecret(secret),
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + config.auth.refreshTtlDays * DAY_MS),
      absoluteExpiresAt: new Date(now.getTime() + config.auth.sessionMaxDays * DAY_MS),
      ip: clip(context.ip, 64),
      userAgent: clip(context.userAgent, 255)
    });

    // Aufräumen beiläufig: abgelaufene/gesperrte Sitzungen nach einer Woche entfernen
    this.purgeOld().catch(() => undefined);

    return { sid, accessToken: signAccessToken(user.id, sid), refreshToken: `${sid}.${secret}` };
  }

  /**
   * Tauscht ein Erneuerungs-Token gegen ein neues Paar (Rotation).
   * Wirft SessionError mit: INVALID_REFRESH_TOKEN, USER_INACTIVE, REFRESH_IN_PROGRESS, REFRESH_TOKEN_REUSED.
   * @returns {Promise<{user:Object, sid:string, accessToken:string, refreshToken:string}>}
   */
  static async rotate(rawToken) {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) throw new SessionError('INVALID_REFRESH_TOKEN', 'Ungültiges Erneuerungs-Token');

    const session = await Session.findByPk(parsed.sid);
    if (!session || session.revokedAt) {
      throw new SessionError('INVALID_REFRESH_TOKEN', 'Sitzung ist beendet');
    }

    const now = new Date();
    if (now > session.expiresAt || now > session.absoluteExpiresAt) {
      await this.revoke(session.id, 'expired');
      throw new SessionError('INVALID_REFRESH_TOKEN', 'Sitzung ist abgelaufen');
    }

    const presented = hashSecret(parsed.secret);
    if (!safeEqual(presented, session.refreshHash)) {
      if (session.previousHash && safeEqual(presented, session.previousHash)) {
        // Zwei Tabs erneuern fast gleichzeitig: das zuletzt rotierte Token ist noch "in Arbeit"
        const ageMs = now - new Date(session.rotatedAt || 0);
        if (ageMs <= config.auth.refreshGraceSeconds * 1000) {
          throw new SessionError('REFRESH_IN_PROGRESS', 'Erneuerung läuft bereits, bitte erneut versuchen');
        }
        // Ein bereits ausgetauschtes Token taucht später wieder auf: vermutlich gestohlen → Sitzung sperren
        await this.revoke(session.id, 'reuse_detected');
        const error = new SessionError('REFRESH_TOKEN_REUSED', 'Das Erneuerungs-Token wurde bereits verwendet. Aus Sicherheitsgründen wurde die Sitzung beendet.');
        error.userId = session.userId;
        throw error;
      }
      throw new SessionError('INVALID_REFRESH_TOKEN', 'Ungültiges Erneuerungs-Token');
    }

    const user = await User.findByPk(session.userId);
    if (!user || !user.isActive) {
      await this.revoke(session.id, 'user_inactive');
      throw new SessionError('USER_INACTIVE', 'Benutzer ist deaktiviert');
    }

    const secret = newSecret();
    const nextExpiry = new Date(Math.min(
      now.getTime() + config.auth.refreshTtlDays * DAY_MS,
      session.absoluteExpiresAt.getTime()
    ));
    // Bedingtes Update: gewinnt nur, wenn niemand sonst zwischenzeitlich rotiert hat
    const [updated] = await Session.update(
      { previousHash: session.refreshHash, refreshHash: hashSecret(secret), rotatedAt: now, lastUsedAt: now, expiresAt: nextExpiry },
      { where: { id: session.id, refreshHash: session.refreshHash, revokedAt: null } }
    );
    if (updated !== 1) {
      throw new SessionError('REFRESH_IN_PROGRESS', 'Erneuerung läuft bereits, bitte erneut versuchen');
    }

    return { user, sid: session.id, accessToken: signAccessToken(user.id, session.id), refreshToken: `${session.id}.${secret}` };
  }

  /**
   * Prüft ein Zugriffs-Token und liefert den aktuellen Benutzer.
   * Wirft SessionError mit: TOKEN_EXPIRED, INVALID_TOKEN, SESSION_ENDED, USER_INACTIVE.
   * @returns {Promise<{user:Object, sid:string}>}
   */
  static async authenticate(accessToken) {
    let payload;
    try {
      payload = jwt.verify(accessToken, config.jwt.secret, { issuer: ISSUER, audience: AUDIENCE });
    } catch (error) {
      if (error.name === 'TokenExpiredError') throw new SessionError('TOKEN_EXPIRED', 'Zugriffs-Token abgelaufen');
      throw new SessionError('INVALID_TOKEN', 'Ungültiger Token');
    }
    if (!payload.sid || !payload.userId) throw new SessionError('INVALID_TOKEN', 'Ungültiger Token');

    const session = await Session.findByPk(payload.sid, { attributes: ['id', 'userId', 'revokedAt', 'absoluteExpiresAt'] });
    if (!session || session.revokedAt || new Date() > session.absoluteExpiresAt || session.userId !== payload.userId) {
      throw new SessionError('SESSION_ENDED', 'Die Sitzung wurde beendet. Bitte erneut anmelden.');
    }

    const user = await User.findByPk(payload.userId, { attributes: { exclude: ['password'] } });
    if (!user || !user.isActive) {
      throw new SessionError('USER_INACTIVE', 'Benutzer ist deaktiviert');
    }
    return { user, sid: session.id };
  }

  /**
   * Meldet die Sitzung ab, zu der die mitgeschickten Tokens gehören. Die Zugehörigkeit muss belegt sein
   * (passendes Erneuerungs-Token oder gültig signiertes – auch abgelaufenes – Zugriffs-Token), damit niemand
   * fremde Sitzungen beenden kann.
   * @returns {Promise<{sid:string,userId:number,email:string|null}|null>} null, wenn keine Sitzung zugeordnet werden konnte
   */
  static async logout({ refreshToken, accessToken } = {}) {
    let sid = null;

    const parsed = parseRefreshToken(refreshToken);
    if (parsed) {
      const session = await Session.findByPk(parsed.sid);
      if (session) {
        const presented = hashSecret(parsed.secret);
        if (safeEqual(presented, session.refreshHash) || (session.previousHash && safeEqual(presented, session.previousHash))) {
          sid = session.id;
        }
      }
    }
    if (!sid && accessToken) {
      try {
        sid = jwt.verify(accessToken, config.jwt.secret, { issuer: ISSUER, audience: AUDIENCE, ignoreExpiration: true }).sid || null;
      } catch {
        sid = null;
      }
    }
    if (!sid) return null;

    const session = await Session.findByPk(sid, { attributes: ['id', 'userId'] });
    if (!session) return null;
    await this.revoke(sid, 'logout');
    const user = await User.findByPk(session.userId, { attributes: ['id', 'email'] });
    return { sid, userId: session.userId, email: user ? user.email : null };
  }

  /** Beendet eine Sitzung (idempotent). */
  static async revoke(sid, reason = 'logout') {
    const [count] = await Session.update(
      { revokedAt: new Date(), revokedReason: reason },
      { where: { id: sid, revokedAt: null } }
    );
    return count > 0;
  }

  /**
   * Beendet alle Sitzungen eines Benutzers (Passwortwechsel, Sperrung, Löschung),
   * optional mit Ausnahme der aktuellen Sitzung. Läuft der Aufruf innerhalb einer Transaktion, muss sie
   * mitgegeben werden (SQLite: sonst wartet eine zweite Verbindung auf die Schreibsperre der ersten).
   * @returns {Promise<number>} Anzahl beendeter Sitzungen
   */
  static async revokeAllForUser(userId, { exceptSid = null, reason = 'revoked', transaction } = {}) {
    const where = { userId, revokedAt: null };
    if (exceptSid) where.id = { [Op.ne]: exceptSid };
    const [count] = await Session.update({ revokedAt: new Date(), revokedReason: reason }, { where, transaction });
    return count;
  }

  /** Sitzungs-ID aus einem Erneuerungs-Token (ohne Prüfung), z. B. für das Abmelden. */
  static sessionIdFromRefreshToken(rawToken) {
    return parseRefreshToken(rawToken)?.sid ?? null;
  }

  /** Löscht Sitzungen, die seit über einer Woche beendet oder abgelaufen sind. */
  static async purgeOld(now = new Date()) {
    const cutoff = new Date(now.getTime() - 7 * DAY_MS);
    return Session.destroy({
      where: { [Op.or]: [{ revokedAt: { [Op.lt]: cutoff } }, { absoluteExpiresAt: { [Op.lt]: cutoff } }] }
    });
  }
}

module.exports = SessionService;
module.exports.SessionError = SessionError;
