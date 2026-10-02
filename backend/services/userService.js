const { User, MinijobSetting, TimeEntry, PeriodClosure, sequelize } = require('../models');
const { Op } = require('sequelize');
const TokenService = require('./tokenService');
const AuditService = require('./auditService');

/** Fachlich relevante Konto-Felder für das Änderungsprotokoll (nie das Passwort). */
const accountSnapshot = (user) => ({
  email: user.email,
  name: user.name,
  role: user.role,
  isActive: user.isActive
});

const settingsSnapshot = (user) => ({
  stundenlohn: user.stundenlohn == null ? null : Number(user.stundenlohn),
  abrechnungStart: user.abrechnungStart,
  abrechnungEnde: user.abrechnungEnde,
  lohnzettelEmail: user.lohnzettelEmail || null
});

/** Auslöser aus einem Objekt `{id,email}`; eine nackte ID (alter Aufruf) wird unterstützt. */
const normalizeActor = (actor) => (typeof actor === 'number' || typeof actor === 'string' ? { id: Number(actor) } : actor || null);

/**
 * ✅ User Service - User-spezifische Business Logic
 * Enthält alle User-bezogenen Operationen und Geschäftslogik.
 * Änderungen an Konten werden zusammen mit dem Änderungsprotokoll in einer Transaktion gespeichert.
 */
class UserService {
  /**
   * Erstellt einen neuen User
   * @param {Object} userData - User Daten
   * @param {string} userData.email - Email
   * @param {string} userData.password - Passwort
   * @param {string} userData.name - Name
   * @param {string} userData.role - Rolle (admin/mitarbeiter)
   * @param {{id:number,email:string}} [actor] Auslöser (ohne Angabe: das neue Konto selbst, z. B. Selbstregistrierung)
   * @returns {Promise<Object>} Erstellter User (ohne Passwort)
   * @throws {Error} Bei Validation oder Erstellung Fehlern
   */
  static async createUser(userData, actor) {
    const { email, password, name, role = 'mitarbeiter' } = userData;

    // Prüfen ob User bereits existiert
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error(`USER_ALREADY_EXISTS:Email ${email} ist bereits registriert`);
    }

    // Rolle validieren
    if (!['admin', 'mitarbeiter'].includes(role)) {
      throw new Error('INVALID_ROLE:Rolle muss admin oder mitarbeiter sein');
    }

    try {
      return await sequelize.transaction(async (transaction) => {
        const user = await User.create({
          email,
          password, // Wird automatisch in Model gehashed
          name,
          role,
          isActive: true
        }, { transaction });

        await AuditService.record({
          actor: normalizeActor(actor) || { id: user.id, email: user.email },
          action: 'user.create',
          entityType: 'User',
          entityId: user.id,
          targetUserId: user.id,
          after: accountSnapshot(user),
          meta: { selfRegistration: !actor }
        }, { transaction });

        return user.toSafeJSON();
      });
    } catch (error) {
      if (error.name === 'SequelizeValidationError') {
        const messages = error.errors.map(err => err.message);
        throw new Error(`VALIDATION_ERROR:${messages.join(', ')}`);
      }
      throw new Error(`USER_CREATION_ERROR:${error.message}`);
    }
  }

  /**
   * Authentifiziert einen User
   * @param {string} email - User Email
   * @param {string} password - User Passwort
   * @returns {Promise<Object>} { user, tokens }
   * @throws {Error} Bei Auth-Fehlern
   */
  static async authenticateUser(email, password) {
    // User finden
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new Error('INVALID_CREDENTIALS:Email oder Passwort falsch');
    }

    // Passwort prüfen
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new Error('INVALID_CREDENTIALS:Email oder Passwort falsch');
    }

    // User aktiv?
    if (!user.isActive) {
      throw new Error('USER_INACTIVE:Benutzer ist deaktiviert');
    }

    // Tokens generieren
    const tokens = TokenService.generateTokens(user);

    return {
      user: user.toSafeJSON(),
      tokens
    };
  }

  /**
   * User per ID finden
   * @param {number} userId - User ID
   * @param {boolean} includeInactive - Auch deaktivierte User einschließen
   * @returns {Promise<Object|null>} User Object oder null
   */
  static async findUserById(userId, includeInactive = false) {
    const whereClause = { id: userId };
    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const user = await User.findOne({
      where: whereClause,
      attributes: { exclude: ['password'] }
    });

    return user ? user.toSafeJSON() : null;
  }

  /**
   * User per Email finden
   * @param {string} email - User Email
   * @param {boolean} includeInactive - Auch deaktivierte User einschließen
   * @returns {Promise<Object|null>} User Object oder null
   */
  static async findUserByEmail(email, includeInactive = false) {
    const whereClause = { email };
    if (!includeInactive) {
      whereClause.isActive = true;
    }

    const user = await User.findOne({
      where: whereClause,
      attributes: { exclude: ['password'] }
    });

    return user ? user.toSafeJSON() : null;
  }

  /**
   * User-Profil aktualisieren
   * @param {number} userId - User ID
   * @param {Object} updateData - Update Daten
   * @param {{id:number,email:string}} [actor] Auslöser (ohne Angabe: der Benutzer selbst)
   * @returns {Promise<Object>} Aktualisierter User
   * @throws {Error} Bei Update-Fehlern
   */
  static async updateUserProfile(userId, updateData, actor) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    if (!user.isActive) {
      throw new Error('USER_INACTIVE:Benutzer ist deaktiviert');
    }

    // Email-Eindeutigkeit prüfen (falls Email geändert wird)
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await User.findOne({ where: { email: updateData.email } });
      if (existingUser) {
        throw new Error('EMAIL_EXISTS:Email bereits vergeben');
      }
    }

    try {
      return await sequelize.transaction(async (transaction) => {
        const before = accountSnapshot(user);
        await user.update(updateData, { transaction });
        await AuditService.record({
          actor: normalizeActor(actor) || { id: user.id, email: before.email },
          action: 'user.profile_update',
          entityType: 'User',
          entityId: user.id,
          targetUserId: user.id,
          before,
          after: accountSnapshot(user)
        }, { transaction });
        return user.toSafeJSON();
      });
    } catch (error) {
      if (error.name === 'SequelizeValidationError') {
        const messages = error.errors.map(err => err.message);
        throw new Error(`VALIDATION_ERROR:${messages.join(', ')}`);
      }
      throw new Error(`UPDATE_ERROR:${error.message}`);
    }
  }

  /**
   * User-Passwort ändern
   * @param {number} userId - User ID
   * @param {string} currentPassword - Aktuelles Passwort
   * @param {string} newPassword - Neues Passwort
   * @param {{id:number,email:string}} [actor] Auslöser (ohne Angabe: der Benutzer selbst)
   * @returns {Promise<boolean>} True bei Erfolg
   * @throws {Error} Bei Passwort-Fehlern
   */
  static async changeUserPassword(userId, currentPassword, newPassword, actor) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    if (!user.isActive) {
      throw new Error('USER_INACTIVE:Benutzer ist deaktiviert');
    }

    // Aktuelles Passwort prüfen
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      throw new Error('INVALID_CURRENT_PASSWORD:Aktuelles Passwort ist falsch');
    }

    try {
      await sequelize.transaction(async (transaction) => {
        await user.update({ password: newPassword }, { transaction });
        await AuditService.record({
          actor: normalizeActor(actor) || { id: user.id, email: user.email },
          action: 'user.password_change',
          entityType: 'User',
          entityId: user.id,
          targetUserId: user.id
        }, { transaction });
      });
      return true;
    } catch (error) {
      throw new Error(`PASSWORD_CHANGE_ERROR:${error.message}`);
    }
  }

  /**
   * User-Arbeitseinstellungen aktualisieren
   * @param {number} userId - User ID
   * @param {Object} settings - Arbeitseinstellungen
   * @param {{id:number,email:string}} [actor] Auslöser (ohne Angabe: der Benutzer selbst)
   * @returns {Promise<Object>} Aktualisierte Settings
   * @throws {Error} Bei Update-Fehlern
   */
  static async updateUserSettings(userId, settings, actor) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    if (!user.isActive) {
      throw new Error('USER_INACTIVE:Benutzer ist deaktiviert');
    }

    // Settings validieren
    const validSettings = {};
    if (settings.stundenlohn !== undefined) {
      if (settings.stundenlohn < 0 || settings.stundenlohn > 999) {
        throw new Error('INVALID_HOURLY_RATE:Stundenlohn muss zwischen 0 und 999 Euro liegen');
      }
      validSettings.stundenlohn = parseFloat(settings.stundenlohn);
    }

    if (settings.abrechnungStart !== undefined) {
      if (settings.abrechnungStart < 1 || settings.abrechnungStart > 31) {
        throw new Error('INVALID_BILLING_START:Abrechnungsstart muss zwischen 1 und 31 liegen');
      }
      validSettings.abrechnungStart = parseInt(settings.abrechnungStart);
    }

    if (settings.abrechnungEnde !== undefined) {
      if (settings.abrechnungEnde < 1 || settings.abrechnungEnde > 31) {
        throw new Error('INVALID_BILLING_END:Abrechnungsende muss zwischen 1 und 31 liegen');
      }
      validSettings.abrechnungEnde = parseInt(settings.abrechnungEnde);
    }

    if (settings.lohnzettelEmail !== undefined) {
      validSettings.lohnzettelEmail = settings.lohnzettelEmail || null;
    }

    try {
      await sequelize.transaction(async (transaction) => {
        const before = settingsSnapshot(user);
        await user.update(validSettings, { transaction });
        await AuditService.record({
          actor: normalizeActor(actor) || { id: user.id, email: user.email },
          action: 'user.settings_update',
          entityType: 'User',
          entityId: user.id,
          targetUserId: user.id,
          before,
          after: settingsSnapshot(user)
        }, { transaction });
      });
      return {
        stundenlohn: user.stundenlohn,
        abrechnungStart: user.abrechnungStart,
        abrechnungEnde: user.abrechnungEnde,
        lohnzettelEmail: user.lohnzettelEmail
      };
    } catch (error) {
      throw new Error(`SETTINGS_UPDATE_ERROR:${error.message}`);
    }
  }

  /**
   * Alle User auflisten (Admin-Funktion)
   * @param {Object} options - Query Options
   * @param {number} options.page - Seite
   * @param {number} options.limit - Limit pro Seite
   * @param {string} options.search - Suchbegriff
   * @param {string} options.role - Rollenfilter
   * @returns {Promise<Object>} { users, pagination }
   */
  static async getAllUsers(options = {}) {
    const {
      page = 1,
      limit = 50,
      search = '',
      role = ''
    } = options;

    // Query-Filter aufbauen
    const whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    if (role && ['admin', 'mitarbeiter'].includes(role)) {
      whereClause.role = role;
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
      const { rows: users, count: total } = await User.findAndCountAll({
        where: whereClause,
        attributes: { exclude: ['password'] },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: offset
      });

      return {
        users: users.map(user => user.toSafeJSON()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      throw new Error(`USER_LIST_ERROR:${error.message}`);
    }
  }

  /**
   * User deaktivieren/aktivieren (Admin-Funktion)
   * @param {number} userId - User ID
   * @param {{id:number,email:string}|number} actor - ausführender Admin
   * @returns {Promise<Object>} Aktualisierter User
   * @throws {Error} Bei Status-Änderungs-Fehlern
   */
  static async toggleUserStatus(userId, actor) {
    const admin = normalizeActor(actor);

    // Sich selbst nicht deaktivieren
    if (parseInt(userId) === parseInt(admin?.id)) {
      throw new Error('CANNOT_DEACTIVATE_SELF:Sie können sich nicht selbst deaktivieren');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    try {
      return await sequelize.transaction(async (transaction) => {
        const before = accountSnapshot(user);
        await user.update({ isActive: !user.isActive }, { transaction });
        await AuditService.record({
          actor: admin,
          action: user.isActive ? 'user.activate' : 'user.deactivate',
          entityType: 'User',
          entityId: user.id,
          targetUserId: user.id,
          before,
          after: accountSnapshot(user)
        }, { transaction });
        return user.toSafeJSON();
      });
    } catch (error) {
      throw new Error(`STATUS_TOGGLE_ERROR:${error.message}`);
    }
  }

  /**
   * User-Statistiken (Admin-Funktion)
   * @returns {Promise<Object>} User Statistiken
   */
  static async getUserStats() {
    try {
      const totalUsers = await User.count();
      const activeUsers = await User.count({ where: { isActive: true } });

      const roleStats = await User.findAll({
        attributes: [
          'role',
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
          [require('sequelize').fn('COUNT', require('sequelize').literal('CASE WHEN isActive = 1 THEN 1 END')), 'activeCount']
        ],
        group: 'role'
      });

      return {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        byRole: roleStats.map(stat => ({
          role: stat.role,
          total: parseInt(stat.dataValues.count),
          active: parseInt(stat.dataValues.activeCount || 0)
        }))
      };
    } catch (error) {
      throw new Error(`USER_STATS_ERROR:${error.message}`);
    }
  }

  /**
   * User Dashboard-Daten zusammenstellen
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Dashboard Daten
   */
  static async getUserDashboardData(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    if (!user.isActive) {
      throw new Error('USER_INACTIVE:Benutzer ist deaktiviert');
    }

    return {
      user: user.toSafeJSON(),
      settings: {
        stundenlohn: user.stundenlohn || 12.00,
        abrechnungStart: user.abrechnungStart || 1,
        abrechnungEnde: user.abrechnungEnde || 31,
        lohnzettelEmail: user.lohnzettelEmail || user.email
      },
      stats: {
        currentMonth: {
          hoursWorked: 0,
          earnings: 0
        }
      }
    };
  }

  /**
   * Prüft ob ein User Admin-Rechte hat
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True wenn User Admin ist
   */
  static async isUserAdmin(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['role', 'isActive']
    });

    return user && user.isActive && user.role === 'admin';
  }

  /**
   * Admin-Update eines beliebigen Users (auch inaktiver).
   * Anders als updateUserProfile blockiert diese Methode inaktive Nutzer NICHT,
   * da Admins deaktivierte Konten bearbeiten können müssen.
   * @param {number} userId - Ziel-User-ID
   * @param {Object} data - { email, name, role, isActive, password }
   * @param {{id:number,email:string}} [actor] ausführender Admin
   * @returns {Promise<Object>} Aktualisierter User (ohne Passwort)
   * @throws {Error} USER_NOT_FOUND, EMAIL_EXISTS, INVALID_ROLE
   */
  static async adminUpdateUser(userId, data, actor) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    const { email, name, role, isActive, password } = data;

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw new Error('EMAIL_EXISTS:Email bereits vergeben');
      }
    }

    if (role !== undefined && !['admin', 'mitarbeiter'].includes(role)) {
      throw new Error('INVALID_ROLE:Rolle muss admin oder mitarbeiter sein');
    }

    const updateData = {};
    if (email) updateData.email = email;
    if (name) updateData.name = name;
    if (role && ['admin', 'mitarbeiter'].includes(role)) updateData.role = role;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    const passwordChanged = !!(password && password.trim() !== '');
    if (passwordChanged) updateData.password = password;

    try {
      return await sequelize.transaction(async (transaction) => {
        const before = accountSnapshot(user);
        await user.update(updateData, { transaction });
        await AuditService.record({
          actor: normalizeActor(actor),
          action: 'user.update',
          entityType: 'User',
          entityId: user.id,
          targetUserId: user.id,
          before,
          after: accountSnapshot(user),
          meta: passwordChanged ? { passwordChanged: true } : null
        }, { transaction });
        return user.toSafeJSON();
      });
    } catch (error) {
      if (error.name === 'SequelizeValidationError') {
        const messages = error.errors.map(err => err.message);
        throw new Error(`VALIDATION_ERROR:${messages.join(', ')}`);
      }
      throw new Error(`UPDATE_ERROR:${error.message}`);
    }
  }

  /**
   * Admin-Update der Arbeitseinstellungen eines beliebigen Users (auch inaktiver).
   * Ein geänderter Stundenlohn gilt nur für neue Zeiteinträge (Satz wird je Eintrag eingefroren).
   * @param {number} userId - Ziel-User-ID
   * @param {Object} settings - { stundenlohn, abrechnungStart, abrechnungEnde, lohnzettelEmail }
   * @param {{id:number,email:string}} [actor] ausführender Admin
   * @returns {Promise<Object>} Aktualisierter User (ohne Passwort)
   * @throws {Error} USER_NOT_FOUND
   */
  static async adminUpdateUserSettings(userId, settings, actor) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    const updateData = {};
    if (settings.stundenlohn !== undefined) updateData.stundenlohn = parseFloat(settings.stundenlohn);
    if (settings.abrechnungStart !== undefined) updateData.abrechnungStart = parseInt(settings.abrechnungStart);
    if (settings.abrechnungEnde !== undefined) updateData.abrechnungEnde = parseInt(settings.abrechnungEnde);
    if (settings.lohnzettelEmail !== undefined) updateData.lohnzettelEmail = settings.lohnzettelEmail || null;

    try {
      return await sequelize.transaction(async (transaction) => {
        const before = settingsSnapshot(user);
        await user.update(updateData, { transaction });
        await AuditService.record({
          actor: normalizeActor(actor),
          action: 'user.settings_update',
          entityType: 'User',
          entityId: user.id,
          targetUserId: user.id,
          before,
          after: settingsSnapshot(user)
        }, { transaction });
        return user.toSafeJSON();
      });
    } catch (error) {
      throw new Error(`SETTINGS_UPDATE_ERROR:${error.message}`);
    }
  }

  /**
   * Löscht einen User (Admin). Verhindert Selbstlöschung sowie die Löschung von Usern
   * mit Zeiteinträgen, Monatsabschlüssen oder erstellten Minijob-Einstellungen –
   * Arbeitszeitnachweise müssen erhalten bleiben; solche Konten werden deaktiviert.
   * @param {number} userId - Ziel-User-ID
   * @param {{id:number,email:string}|number} actor - ausführender Admin
   * @returns {Promise<Object>} { name, email } des gelöschten Users
   * @throws {Error} CANNOT_DELETE_SELF, USER_NOT_FOUND, USER_HAS_DEPENDENCIES
   */
  static async deleteUser(userId, actor) {
    const admin = normalizeActor(actor);

    if (parseInt(userId) === parseInt(admin?.id)) {
      throw new Error('CANNOT_DELETE_SELF:Sie können sich nicht selbst löschen');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    const entryCount = await TimeEntry.count({ where: { userId } });
    const closureCount = await PeriodClosure.count({ where: { userId } });
    if (entryCount > 0 || closureCount > 0) {
      throw new Error(
        `USER_HAS_DEPENDENCIES:Benutzer kann nicht gelöscht werden - es existieren ${entryCount} Zeiteintrag/-einträge` +
        `${closureCount > 0 ? ` und ${closureCount} Monatsabschluss/-abschlüsse` : ''}. ` +
        'Arbeitszeitnachweise müssen erhalten bleiben; bitte das Konto stattdessen deaktivieren.'
      );
    }

    const minijobCount = await MinijobSetting.count({ where: { createdBy: userId } });
    if (minijobCount > 0) {
      throw new Error(`USER_HAS_DEPENDENCIES:Benutzer kann nicht gelöscht werden - hat ${minijobCount} Minijob-Einstellung(en) erstellt`);
    }

    const deleted = { name: user.name, email: user.email };
    await sequelize.transaction(async (transaction) => {
      const before = accountSnapshot(user);
      await user.destroy({ transaction });
      await AuditService.record({
        actor: admin,
        action: 'user.delete',
        entityType: 'User',
        entityId: Number(userId),
        targetUserId: Number(userId),
        before
      }, { transaction });
    });
    return deleted;
  }
}

module.exports = UserService;
