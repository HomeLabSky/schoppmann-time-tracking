import bcrypt from 'bcryptjs';
import { and, count, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import config from '../config';
import { db, transaction } from '../db/client';
import { minijobSettings, periodClosures, timeEntries, users, type Role, type User } from '../db/schema';
import { AppError } from '../lib/errors';
import { hashPassword, toSafeUser, verifyPassword, type SafeUser } from '../models/user';
import { AuditService, type Actor } from './auditService';
import { LoginThrottleService } from './loginThrottle';
import { SessionService } from './sessionService';

// Vergleichswert für unbekannte E-Mail-Adressen: Die Anmeldung dauert dann gleich lange wie bei einem
// falschen Passwort und verrät über die Antwortzeit nicht, ob ein Konto existiert.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

/** Fachlich relevante Konto-Felder für das Änderungsprotokoll (nie das Passwort). */
const accountSnapshot = (user: User) => ({
  email: user.email,
  name: user.name,
  role: user.role,
  isActive: user.isActive
});

const settingsSnapshot = (user: User) => ({
  stundenlohn: user.stundenlohn == null ? null : Number(user.stundenlohn),
  abrechnungStart: user.abrechnungStart,
  abrechnungEnde: user.abrechnungEnde,
  lohnzettelEmail: user.lohnzettelEmail || null
});

/** Optionale Einschränkung neuer Konten auf bestimmte E-Mail-Domains (ALLOWED_EMAIL_DOMAINS) */
const assertAllowedDomain = (email: string): void => {
  const allowed = config.allowedEmailDomains;
  if (allowed.length === 0) return;
  const domain = String(email).split('@')[1] ?? '';
  if (!allowed.includes(domain)) {
    throw new AppError('VALIDATION_ERROR', 'Eingabefehler', {
      fields: { email: 'Email-Domain nicht erlaubt' },
      details: ['Email-Domain nicht erlaubt']
    });
  }
};

const findById = (userId: number): User | undefined => db().select().from(users).where(eq(users.id, userId)).get();
const findByEmail = (email: string): User | undefined => db().select().from(users).where(eq(users.email, email)).get();

const requireUser = (userId: number): User => {
  const user = findById(userId);
  if (!user) throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
  return user;
};

const requireActiveUser = (userId: number): User => {
  const user = requireUser(userId);
  if (!user.isActive) throw new AppError('USER_INACTIVE', 'Benutzer ist deaktiviert');
  return user;
};

const assertEmailFree = (email: string | undefined, current?: User): void => {
  if (email && email !== current?.email && findByEmail(email)) {
    throw new AppError('EMAIL_EXISTS', 'Email bereits vergeben');
  }
};

/** Ändert einen Benutzer und liefert den neuen Stand (innerhalb einer Transaktion aufrufen) */
const updateUser = (userId: number, data: Partial<Omit<User, 'id' | 'createdAt'>>): User =>
  db().update(users).set(data).where(eq(users.id, userId)).returning().get() as User;

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: Role;
}

export interface WorkSettingsInput {
  stundenlohn?: number | undefined;
  abrechnungStart?: number | undefined;
  abrechnungEnde?: number | undefined;
  lohnzettelEmail?: string | null | undefined;
}

const settingsUpdate = (settings: WorkSettingsInput): Partial<User> => {
  const update: Partial<User> = {};
  if (settings.stundenlohn !== undefined) update.stundenlohn = Number(settings.stundenlohn);
  if (settings.abrechnungStart !== undefined) update.abrechnungStart = Number(settings.abrechnungStart);
  if (settings.abrechnungEnde !== undefined) update.abrechnungEnde = Number(settings.abrechnungEnde);
  if (settings.lohnzettelEmail !== undefined) update.lohnzettelEmail = settings.lohnzettelEmail || null;
  return update;
};

/**
 * User Service: Konten, Anmeldung, Arbeitseinstellungen.
 * Änderungen an Konten werden zusammen mit dem Änderungsprotokoll in einer Transaktion gespeichert.
 */
export class UserService {
  /**
   * Legt ein Konto an.
   * @param actor Auslöser (ohne Angabe: das neue Konto selbst, z. B. Selbstregistrierung)
   */
  static async createUser({ email, password, name, role = 'mitarbeiter' }: CreateUserInput, actor?: Actor): Promise<SafeUser> {
    assertAllowedDomain(email);
    if (findByEmail(email)) {
      throw new AppError('EMAIL_EXISTS', `Email ${email} ist bereits registriert`);
    }
    if (role !== 'admin' && role !== 'mitarbeiter') {
      throw new AppError('INVALID_ROLE', 'Rolle muss admin oder mitarbeiter sein');
    }
    const passwordHash = await hashPassword(password);

    return transaction(() => {
      const user = db().insert(users).values({ email, password: passwordHash, name, role, isActive: true }).returning().get();
      AuditService.record({
        actor: actor || { id: user.id, email: user.email },
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        after: accountSnapshot(user),
        meta: { selfRegistration: !actor }
      });
      return toSafeUser(user);
    });
  }

  /**
   * Prüft Zugangsdaten. Sitzung, Konto-Sperre und Protokoll: services/authService.ts
   * @throws AppError INVALID_CREDENTIALS, USER_INACTIVE
   */
  static async authenticateUser(email: string, password: string): Promise<{ user: SafeUser }> {
    const user = findByEmail(email);
    if (!user) {
      // ohne Konto trotzdem einen Hash prüfen: gleiche Antwortzeit
      await bcrypt.compare(String(password), DUMMY_HASH);
      throw new AppError('INVALID_CREDENTIALS', 'Email oder Passwort falsch');
    }
    if (!(await verifyPassword(password, user.password))) {
      throw new AppError('INVALID_CREDENTIALS', 'Email oder Passwort falsch');
    }
    if (!user.isActive) {
      throw new AppError('USER_INACTIVE', 'Benutzer ist deaktiviert');
    }
    return { user: toSafeUser(user) };
  }

  /** Konto per ID (ohne Passwort); standardmäßig nur aktive */
  static async findUserById(userId: number, includeInactive = false): Promise<SafeUser | null> {
    const user = findById(userId);
    if (!user || (!includeInactive && !user.isActive)) return null;
    return toSafeUser(user);
  }

  /** Konto per E-Mail (ohne Passwort); standardmäßig nur aktive */
  static async findUserByEmail(email: string, includeInactive = false): Promise<SafeUser | null> {
    const user = findByEmail(email);
    if (!user || (!includeInactive && !user.isActive)) return null;
    return toSafeUser(user);
  }

  /** Name/E-Mail des eigenen Kontos ändern */
  static async updateUserProfile(userId: number, data: { name?: string | undefined; email?: string | undefined }, actor?: Actor): Promise<SafeUser> {
    const user = requireActiveUser(userId);
    assertEmailFree(data.email, user);

    const update: Partial<User> = {};
    if (data.name) update.name = data.name;
    if (data.email) update.email = data.email;

    return transaction(() => {
      const before = accountSnapshot(user);
      const updated = Object.keys(update).length > 0 ? updateUser(user.id, update) : user;
      AuditService.record({
        actor: actor || { id: user.id, email: before.email },
        action: 'user.profile_update',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        before,
        after: accountSnapshot(updated)
      });
      return toSafeUser(updated);
    });
  }

  /**
   * Eigenes Passwort ändern; beendet alle anderen Sitzungen des Benutzers.
   * @param keepSessionId aktuelle Sitzung, die bestehen bleibt
   */
  static async changeUserPassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    actor?: Actor,
    keepSessionId: string | null = null
  ): Promise<boolean> {
    const user = requireActiveUser(userId);
    if (!(await verifyPassword(currentPassword, user.password))) {
      throw new AppError('INVALID_CURRENT_PASSWORD', 'Aktuelles Passwort ist falsch');
    }
    const passwordHash = await hashPassword(newPassword);

    transaction(() => {
      updateUser(user.id, { password: passwordHash });
      AuditService.record({
        actor: actor || { id: user.id, email: user.email },
        action: 'user.password_change',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id
      });
      // Ein neues Passwort macht gestohlene Sitzungen unbrauchbar: alle anderen Geräte werden abgemeldet
      SessionService.revokeAllForUser(user.id, { exceptSid: keepSessionId, reason: 'password_changed' });
    });
    return true;
  }

  /** Eigene Arbeitseinstellungen (Selbstbedienung: Route erlaubt nur die Lohnzettel-E-Mail) */
  static async updateUserSettings(userId: number, settings: WorkSettingsInput, actor?: Actor) {
    const user = requireActiveUser(userId);
    const update = settingsUpdate(settings);

    const updated = transaction(() => {
      const next = Object.keys(update).length > 0 ? updateUser(user.id, update) : user;
      AuditService.record({
        actor: actor || { id: user.id, email: user.email },
        action: 'user.settings_update',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        before: settingsSnapshot(user),
        after: settingsSnapshot(next)
      });
      return next;
    });
    return {
      stundenlohn: updated.stundenlohn,
      abrechnungStart: updated.abrechnungStart,
      abrechnungEnde: updated.abrechnungEnde,
      lohnzettelEmail: updated.lohnzettelEmail
    };
  }

  /** Konten auflisten (Suche in Name/E-Mail, Rollenfilter, Seiten; neueste zuerst) */
  static async getAllUsers(
    { page = 1, limit = 50, search = '', role = '' }: { page?: number; limit?: number; search?: string; role?: string } = {}
  ) {
    const conditions: SQL[] = [];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(like(users.name, pattern), like(users.email, pattern)) as SQL);
    }
    if (role === 'admin' || role === 'mitarbeiter') conditions.push(eq(users.role, role));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = db().select().from(users).where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit).offset((page - 1) * limit)
      .all();
    const total = db().select({ n: count() }).from(users).where(where).get()?.n ?? 0;

    return {
      users: rows.map(toSafeUser),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /** Konto sperren bzw. entsperren (Admin); Sperren beendet alle Sitzungen */
  static async toggleUserStatus(userId: number, admin: Actor): Promise<SafeUser> {
    if (userId === admin?.id) {
      throw new AppError('CANNOT_DEACTIVATE_SELF', 'Sie können sich nicht selbst deaktivieren');
    }
    const user = requireUser(userId);

    return transaction(() => {
      const updated = updateUser(user.id, { isActive: !user.isActive });
      AuditService.record({
        actor: admin,
        action: updated.isActive ? 'user.activate' : 'user.deactivate',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        before: accountSnapshot(user),
        after: accountSnapshot(updated)
      });
      if (!updated.isActive) {
        SessionService.revokeAllForUser(user.id, { reason: 'user_deactivated' });
      }
      return toSafeUser(updated);
    });
  }

  /** Kennzahlen: gesamt, aktiv, je Rolle */
  static async getUserStats() {
    const byRole = db().select({
      role: users.role,
      total: count(),
      active: sql<number>`SUM(CASE WHEN ${users.isActive} = 1 THEN 1 ELSE 0 END)`
    }).from(users).groupBy(users.role).all();

    const total = byRole.reduce((sum, r) => sum + r.total, 0);
    const active = byRole.reduce((sum, r) => sum + Number(r.active || 0), 0);
    return {
      total,
      active,
      inactive: total - active,
      byRole: byRole.map((r) => ({ role: r.role, total: r.total, active: Number(r.active || 0) }))
    };
  }

  /**
   * Admin-Änderung eines beliebigen Kontos (auch inaktiver). Neues Passwort oder Sperrung beenden alle
   * Sitzungen; ein neues Passwort hebt außerdem eine Konto-Sperre nach Fehlversuchen auf.
   * @throws AppError USER_NOT_FOUND, EMAIL_EXISTS, INVALID_ROLE
   */
  static async adminUpdateUser(
    userId: number,
    data: { email?: string | undefined; name?: string | undefined; role?: Role | undefined; isActive?: boolean | undefined; password?: string | undefined },
    actor: Actor
  ): Promise<SafeUser> {
    const user = requireUser(userId);
    const { email, name, role, isActive, password } = data;
    assertEmailFree(email, user);
    if (role !== undefined && role !== 'admin' && role !== 'mitarbeiter') {
      throw new AppError('INVALID_ROLE', 'Rolle muss admin oder mitarbeiter sein');
    }

    const update: Partial<User> = {};
    if (email) update.email = email;
    if (name) update.name = name;
    if (role) update.role = role;
    if (typeof isActive === 'boolean') update.isActive = isActive;
    const passwordChanged = !!(password && password.trim() !== '');
    if (passwordChanged) update.password = await hashPassword(password as string);

    const result = transaction(() => {
      const updated = Object.keys(update).length > 0 ? updateUser(user.id, update) : user;
      AuditService.record({
        actor,
        action: 'user.update',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        before: accountSnapshot(user),
        after: accountSnapshot(updated),
        meta: passwordChanged ? { passwordChanged: true } : null
      });
      if (passwordChanged || !updated.isActive) {
        SessionService.revokeAllForUser(user.id, { reason: passwordChanged ? 'password_reset_by_admin' : 'user_deactivated' });
      }
      return updated;
    });
    // Neues Passwort vom Admin: eine bestehende Konto-Sperre aufheben
    if (passwordChanged) await LoginThrottleService.reset(result.email);
    return toSafeUser(result);
  }

  /**
   * Arbeitseinstellungen eines beliebigen Kontos (Admin). Ein geänderter Stundenlohn gilt nur für neue
   * Zeiteinträge (jeder Eintrag friert seinen Satz ein).
   */
  static async adminUpdateUserSettings(userId: number, settings: WorkSettingsInput, actor: Actor): Promise<SafeUser> {
    const user = requireUser(userId);
    const update = settingsUpdate(settings);

    return transaction(() => {
      const updated = Object.keys(update).length > 0 ? updateUser(user.id, update) : user;
      AuditService.record({
        actor,
        action: 'user.settings_update',
        entityType: 'User',
        entityId: user.id,
        targetUserId: user.id,
        before: settingsSnapshot(user),
        after: settingsSnapshot(updated)
      });
      return toSafeUser(updated);
    });
  }

  /**
   * Löscht ein Konto (Admin). Verhindert Selbstlöschung sowie die Löschung von Konten mit Zeiteinträgen,
   * Monatsabschlüssen oder erstellten Minijob-Einstellungen – Arbeitszeitnachweise müssen erhalten bleiben;
   * solche Konten werden deaktiviert.
   * @throws AppError CANNOT_DELETE_SELF, USER_NOT_FOUND, USER_HAS_DEPENDENCIES
   */
  static async deleteUser(userId: number, admin: Actor): Promise<{ name: string; email: string }> {
    if (userId === admin?.id) {
      throw new AppError('CANNOT_DELETE_SELF', 'Sie können sich nicht selbst löschen');
    }
    const user = requireUser(userId);

    const entryCount = db().select({ n: count() }).from(timeEntries).where(eq(timeEntries.userId, userId)).get()?.n ?? 0;
    const closureCount = db().select({ n: count() }).from(periodClosures).where(eq(periodClosures.userId, userId)).get()?.n ?? 0;
    if (entryCount > 0 || closureCount > 0) {
      throw new AppError('USER_HAS_DEPENDENCIES',
        `Benutzer kann nicht gelöscht werden - es existieren ${entryCount} Zeiteintrag/-einträge` +
        `${closureCount > 0 ? ` und ${closureCount} Monatsabschluss/-abschlüsse` : ''}. ` +
        'Arbeitszeitnachweise müssen erhalten bleiben; bitte das Konto stattdessen deaktivieren.'
      );
    }
    const minijobCount = db().select({ n: count() }).from(minijobSettings).where(eq(minijobSettings.createdBy, userId)).get()?.n ?? 0;
    if (minijobCount > 0) {
      throw new AppError('USER_HAS_DEPENDENCIES', `Benutzer kann nicht gelöscht werden - hat ${minijobCount} Minijob-Einstellung(en) erstellt`);
    }

    transaction(() => {
      // Sitzungen werden per Fremdschlüssel (ON DELETE CASCADE) mitgelöscht
      db().delete(users).where(eq(users.id, userId)).run();
      AuditService.record({
        actor: admin,
        action: 'user.delete',
        entityType: 'User',
        entityId: userId,
        targetUserId: userId,
        before: accountSnapshot(user)
      });
    });
    return { name: user.name, email: user.email };
  }
}

export default UserService;
