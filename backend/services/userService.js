const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { Op } = require('sequelize');
const TokenService = require('./tokenService');

/**
 * ✅ User Service - User-spezifische Business Logic
 * Enthält alle User-bezogenen Operationen und Geschäftslogik
 */
class UserService {
  /**
   * Erstellt einen neuen User
   * @param {Object} userData - User Daten
   * @param {string} userData.email - Email
   * @param {string} userData.password - Passwort
   * @param {string} userData.name - Name
   * @param {string} userData.role - Rolle (admin/mitarbeiter)
   * @returns {Promise<Object>} Erstellter User (ohne Passwort)
   * @throws {Error} Bei Validation oder Erstellung Fehlern
   */
  static async createUser(userData) {
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
      const user = await User.create({
        email,
        password, // Wird automatisch in Model gehashed
        name,
        role,
        isActive: true
      });

      return user.toSafeJSON();
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
   * @returns {Promise<Object>} Aktualisierter User
   * @throws {Error} Bei Update-Fehlern
   */
  static async updateUserProfile(userId, updateData) {
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
      await user.update(updateData);
      return user.toSafeJSON();
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
   * @returns {Promise<boolean>} True bei Erfolg
   * @throws {Error} Bei Passwort-Fehlern
   */
  static async changeUserPassword(userId, currentPassword, newPassword) {
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
      await user.update({ password: newPassword });
      return true;
    } catch (error) {
      throw new Error(`PASSWORD_CHANGE_ERROR:${error.message}`);
    }
  }

  /**
   * User-Arbeitseinstellungen aktualisieren
   * @param {number} userId - User ID
   * @param {Object} settings - Arbeitseinstellungen
   * @returns {Promise<Object>} Aktualisierte Settings
   * @throws {Error} Bei Update-Fehlern
   */
  static async updateUserSettings(userId, settings) {
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
      await user.update(validSettings);
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
   * @param {number} adminUserId - Admin User ID
   * @returns {Promise<Object>} Aktualisierter User
   * @throws {Error} Bei Status-Änderungs-Fehlern
   */
  static async toggleUserStatus(userId, adminUserId) {
    // Sich selbst nicht deaktivieren
    if (parseInt(userId) === parseInt(adminUserId)) {
      throw new Error('CANNOT_DEACTIVATE_SELF:Sie können sich nicht selbst deaktivieren');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
    }

    try {
      const newStatus = !user.isActive;
      await user.update({ isActive: newStatus });
      return user.toSafeJSON();
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

    // Hier könnten später weitere Dashboard-Daten hinzugefügt werden
    // z.B. aktuelle Zeiterfassung, Statistiken, etc.

    return {
      user: user.toSafeJSON(),
      settings: {
        stundenlohn: user.stundenlohn || 12.00,
        abrechnungStart: user.abrechnungStart || 1,
        abrechnungEnde: user.abrechnungEnde || 31,
        lohnzettelEmail: user.lohnzettelEmail || user.email
      },
      // Platzhalter für zukünftige Features
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
   * Validiert User-Eingaben
   * @param {Object} userData - User Daten
   * @param {string} operation - Operation Type ('create', 'update')
   * @returns {Object} { isValid: boolean, errors: Array }
   */
  static validateUserData(userData, operation = 'create') {
    const errors = [];

    if (operation === 'create') {
      if (!userData.email) {
        errors.push('Email ist erforderlich');
      }
      if (!userData.password) {
        errors.push('Passwort ist erforderlich');
      }
      if (!userData.name) {
        errors.push('Name ist erforderlich');
      }
    }

    // Email Format prüfen
    if (userData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        errors.push('Ungültiges Email-Format');
      }
    }

    // Name prüfen
    if (userData.name) {
      if (userData.name.length < 2 || userData.name.length > 50) {
        errors.push('Name muss zwischen 2 und 50 Zeichen haben');
      }
    }

    // Passwort prüfen (bei create oder wenn neues Passwort)
    if (userData.password && (operation === 'create' || userData.password.length > 0)) {
      if (userData.password.length < 8) {
        errors.push('Passwort muss mindestens 8 Zeichen haben');
      }
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(userData.password)) {
        errors.push('Passwort muss Groß-, Kleinbuchstaben und eine Zahl enthalten');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = UserService;