const { MinijobSetting, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const DateService = require('./dateService');

/**
 * ✅ Minijob Service - Minijob-spezifische Business Logic
 * Enthält alle Minijob-bezogenen Operationen und Geschäftslogik
 */
class MinijobService {
  /**
   * Aktuelle gültige Minijob-Einstellung abrufen
   * @param {string} referenceDate - Referenzdatum (default: heute)
   * @returns {Promise<Object|null>} Aktuelle Minijob-Einstellung
   */
  static async getCurrentSetting(referenceDate = null) {
    const today = referenceDate || DateService.getTodayString();
    
    try {
      const currentSetting = await MinijobSetting.findOne({
        where: {
          validFrom: { [Op.lte]: today },
          [Op.or]: [
            { validUntil: null },
            { validUntil: { [Op.gte]: today } }
          ]
        },
        order: [['validFrom', 'DESC']],
        include: [{
          model: User,
          as: 'Creator',
          attributes: ['name', 'email']
        }]
      });

      return currentSetting;
    } catch (error) {
      throw new Error(`CURRENT_SETTING_ERROR:${error.message}`);
    }
  }

  /**
   * Alle Minijob-Einstellungen abrufen
   * @param {Object} options - Query Options
   * @returns {Promise<Object>} { settings, pagination }
   */
  static async getAllSettings(options = {}) {
    const {
      page = 1,
      limit = 20,
      status = '' // 'active', 'inactive', ''
    } = options;

    // Query-Filter aufbauen
    const whereClause = {};
    
    if (status === 'active') {
      whereClause.isActive = true;
    } else if (status === 'inactive') {
      whereClause.isActive = false;
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
      const { rows: settings, count: total } = await MinijobSetting.findAndCountAll({
        where: whereClause,
        include: [{
          model: User,
          as: 'Creator',
          attributes: ['name', 'email']
        }],
        order: [['validFrom', 'DESC']],
        limit: parseInt(limit),
        offset: offset
      });

      return {
        settings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      throw new Error(`SETTINGS_LIST_ERROR:${error.message}`);
    }
  }

  /**
   * Neue Minijob-Einstellung erstellen
   * @param {Object} settingData - Einstellungs-Daten
   * @param {number} createdBy - ID des erstellenden Admins
   * @returns {Promise<Object>} { setting, autoAdjustedSettings }
   */
  static async createSetting(settingData, createdBy) {
    const transaction = await sequelize.transaction();

    try {
      const { monthlyLimit, description, validFrom, validUntil } = settingData;

      // Datums-Validierung
      const validation = this.validateSettingDates(validFrom, validUntil);
      if (!validation.isValid) {
        throw new Error(`VALIDATION_ERROR:${validation.error}`);
      }

      const fromDate = DateService.normalizeToDateString(validFrom);
      const untilDate = validUntil ? DateService.normalizeToDateString(validUntil) : null;

      // Überschneidungsprüfung
      const overlaps = await this.checkForOverlaps(fromDate, untilDate, null, transaction);
      
      let autoAdjustedSettings = [];

      if (overlaps.hasOverlap) {
        const adjustment = await this.handleOverlapForCreate(overlaps.overlappingSettings, fromDate, transaction);
        autoAdjustedSettings = adjustment.adjustedSettings;
      }

      // Neue Einstellung erstellen
      const newSetting = await MinijobSetting.create({
        monthlyLimit: parseFloat(monthlyLimit),
        description,
        validFrom: fromDate,
        validUntil: untilDate,
        createdBy
      }, { transaction });

      await transaction.commit();

      // Aktive Einstellungen aktualisieren
      await this.updateActiveStatus();

      return {
        setting: newSetting,
        autoAdjustedSettings
      };
    } catch (error) {
      await transaction.rollback();
      throw new Error(`SETTING_CREATE_ERROR:${error.message}`);
    }
  }

  /**
   * Minijob-Einstellung aktualisieren
   * @param {number} settingId - Einstellungs-ID
   * @param {Object} updateData - Update-Daten
   * @returns {Promise<Object>} Aktualisierte Einstellung
   */
  static async updateSetting(settingId, updateData) {
    try {
      const setting = await MinijobSetting.findByPk(settingId);
      if (!setting) {
        throw new Error('SETTING_NOT_FOUND:Minijob-Einstellung nicht gefunden');
      }

      const { monthlyLimit, description, validFrom, validUntil } = updateData;

      // Datums-Validierung
      const validation = this.validateSettingDates(validFrom, validUntil);
      if (!validation.isValid) {
        throw new Error(`VALIDATION_ERROR:${validation.error}`);
      }

      const fromDate = DateService.normalizeToDateString(validFrom);
      const untilDate = validUntil ? DateService.normalizeToDateString(validUntil) : null;

      // Aktualisieren
      await setting.update({
        monthlyLimit: parseFloat(monthlyLimit),
        description,
        validFrom: fromDate,
        validUntil: untilDate
      });

      // Aktive Einstellungen aktualisieren
      await this.updateActiveStatus();

      return setting;
    } catch (error) {
      throw new Error(`SETTING_UPDATE_ERROR:${error.message}`);
    }
  }

  /**
   * Minijob-Einstellung löschen mit intelligenter Anpassung
   * @param {number} settingId - Einstellungs-ID
   * @returns {Promise<Object>} { deletedSetting, adjustedSettings }
   */
  static async deleteSetting(settingId) {
    const transaction = await sequelize.transaction();

    try {
      const settingToDelete = await MinijobSetting.findByPk(settingId, { transaction });
      if (!settingToDelete) {
        throw new Error('SETTING_NOT_FOUND:Minijob-Einstellung nicht gefunden');
      }

      // Nur zukünftige Einstellungen dürfen gelöscht werden
      const today = DateService.getTodayString();
      if (settingToDelete.validFrom <= today) {
        throw new Error('CANNOT_DELETE_ACTIVE:Aktive oder vergangene Einstellungen können nicht gelöscht werden');
      }

      // Intelligente Rückwärts-Anpassung
      const adjustedSettings = await this.handleDeletionAdjustment(settingToDelete, transaction);

      // Setting löschen
      const deletedSettingData = {
        id: settingToDelete.id,
        description: settingToDelete.description,
        validFrom: settingToDelete.validFrom,
        validUntil: settingToDelete.validUntil
      };

      await settingToDelete.destroy({ transaction });
      await transaction.commit();

      // Aktive Einstellungen aktualisieren
      await this.updateActiveStatus();

      return {
        deletedSetting: deletedSettingData,
        adjustedSettings
      };
    } catch (error) {
      await transaction.rollback();
      throw new Error(`SETTING_DELETE_ERROR:${error.message}`);
    }
  }

  /**
   * Alle Minijob-Zeiträume neu berechnen
   * @returns {Promise<Object>} { adjustedCount, adjustments }
   */
  static async recalculateAllPeriods() {
    const transaction = await sequelize.transaction();

    try {
      // Alle Einstellungen chronologisch abrufen
      const allSettings = await MinijobSetting.findAll({
        order: [['validFrom', 'ASC']],
        transaction
      });

      let adjustedCount = 0;
      const adjustments = [];

      // Durch alle Einstellungen iterieren und Zeiträume korrigieren
      for (let i = 0; i < allSettings.length; i++) {
        const currentSetting = allSettings[i];
        const nextSetting = allSettings[i + 1];

        let newValidUntil = null; // Standard: unbegrenzt

        if (nextSetting) {
          // Einen Tag vor dem nächsten Setting
          newValidUntil = DateService.getDateBefore(nextSetting.validFrom);
        }

        // Nur aktualisieren wenn sich etwas geändert hat
        const oldValidUntil = currentSetting.validUntil;
        const hasChanged = (oldValidUntil === null && newValidUntil !== null) ||
          (oldValidUntil !== null && newValidUntil === null) ||
          (oldValidUntil !== newValidUntil);

        if (hasChanged) {
          await currentSetting.update({ validUntil: newValidUntil }, { transaction });
          adjustedCount++;

          adjustments.push({
            id: currentSetting.id,
            description: currentSetting.description,
            validFrom: currentSetting.validFrom,
            oldValidUntil: oldValidUntil || 'unbegrenzt',
            newValidUntil: newValidUntil || 'unbegrenzt'
          });
        }
      }

      await transaction.commit();

      // Aktive Einstellungen aktualisieren
      await this.updateActiveStatus();

      return { adjustedCount, adjustments };
    } catch (error) {
      await transaction.rollback();
      throw new Error(`RECALCULATION_ERROR:${error.message}`);
    }
  }

  /**
   * Aktive Status für alle Einstellungen aktualisieren
   * @returns {Promise<Object|null>} Aktuelle aktive Einstellung
   */
  static async updateActiveStatus() {
    try {
      const today = DateService.getTodayString();
      
      // Alle als inaktiv markieren
      await MinijobSetting.update(
        { isActive: false },
        { where: {} }
      );
      
      // Aktuelle Einstellung finden und als aktiv markieren
      const currentSetting = await MinijobSetting.findOne({
        where: {
          validFrom: { [Op.lte]: today },
          [Op.or]: [
            { validUntil: null },
            { validUntil: { [Op.gte]: today } }
          ]
        },
        order: [['validFrom', 'DESC']]
      });
      
      if (currentSetting) {
        await currentSetting.update({ isActive: true });
      }
      
      return currentSetting;
    } catch (error) {
      throw new Error(`STATUS_UPDATE_ERROR:${error.message}`);
    }
  }

  /**
   * Minijob-Statistiken generieren
   * @returns {Promise<Object>} Statistiken
   */
  static async getStatistics() {
    try {
      const totalSettings = await MinijobSetting.count();
      const activeSettings = await MinijobSetting.count({ where: { isActive: true } });
      const currentSetting = await this.getCurrentSetting();

      // Statistiken der letzten 12 Monate
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const recentSettings = await MinijobSetting.findAll({
        where: {
          createdAt: { [Op.gte]: oneYearAgo }
        },
        order: [['createdAt', 'DESC']],
        limit: 10,
        include: [{
          model: User,
          as: 'Creator',
          attributes: ['name', 'email']
        }]
      });

      return {
        overview: {
          total: totalSettings,
          active: activeSettings,
          inactive: totalSettings - activeSettings,
          currentLimit: currentSetting ? currentSetting.monthlyLimit : null
        },
        current: currentSetting,
        recent: recentSettings
      };
    } catch (error) {
      throw new Error(`STATISTICS_ERROR:${error.message}`);
    }
  }

  /**
   * Prüft Überschneidungen mit bestehenden Einstellungen
   * @param {string} startDate - Startdatum
   * @param {string} endDate - Enddatum (null = unbegrenzt)
   * @param {number} excludeId - ID zum Ausschließen (bei Updates)
   * @param {Object} transaction - Datenbank-Transaktion
   * @returns {Promise<Object>} { hasOverlap, overlappingSettings }
   */
  static async checkForOverlaps(startDate, endDate, excludeId = null, transaction = null) {
    const whereClause = {
      [Op.or]: [
        // Neue Einstellung startet innerhalb einer bestehenden
        {
          validFrom: { [Op.lte]: startDate },
          [Op.or]: [
            { validUntil: null },
            { validUntil: { [Op.gte]: startDate } }
          ]
        }
      ]
    };

    // Weitere Überschneidungsprüfungen hinzufügen wenn endDate existiert
    if (endDate) {
      whereClause[Op.or].push(
        {
          validFrom: { [Op.lte]: endDate },
          [Op.or]: [
            { validUntil: null },
            { validUntil: { [Op.gte]: endDate } }
          ]
        },
        {
          validFrom: { [Op.gte]: startDate },
          validUntil: { [Op.lte]: endDate }
        }
      );
    }

    if (excludeId) {
      whereClause.id = { [Op.ne]: excludeId };
    }

    const overlappingSettings = await MinijobSetting.findAll({
      where: whereClause,
      transaction
    });

    return {
      hasOverlap: overlappingSettings.length > 0,
      overlappingSettings
    };
  }

  /**
   * Behandelt Überschneidungen beim Erstellen einer neuen Einstellung
   * @private
   */
  static async handleOverlapForCreate(overlappingSettings, fromDate, transaction) {
    const adjustedSettings = [];

    const previousUnlimitedSetting = overlappingSettings.find(s =>
      s.validUntil === null && s.validFrom < fromDate
    );

    if (overlappingSettings.length === 1 && previousUnlimitedSetting) {
      // Sichere Anpassung: Vorherige unbegrenzte Einstellung beenden
      const newEndDate = DateService.getDateBefore(fromDate);

      await previousUnlimitedSetting.update({
        validUntil: newEndDate
      }, { transaction });

      adjustedSettings.push({
        id: previousUnlimitedSetting.id,
        description: previousUnlimitedSetting.description,
        oldValidUntil: 'unbegrenzt',
        newValidUntil: newEndDate
      });
    } else {
      // Komplexe Überschneidung - Fehler werfen
      throw new Error(`OVERLAPPING_PERIODS:Zeitraum überschneidet sich mit bestehenden Einstellungen`);
    }

    return { adjustedSettings };
  }

  /**
   * Behandelt Anpassungen beim Löschen einer Einstellung
   * @private
   */
  static async handleDeletionAdjustment(settingToDelete, transaction) {
    const adjustedSettings = [];

    // Nachfolgende Einstellungen finden
    const laterSettings = await MinijobSetting.findAll({
      where: {
        validFrom: { [Op.gt]: settingToDelete.validFrom },
        id: { [Op.ne]: settingToDelete.id }
      },
      order: [['validFrom', 'ASC']],
      transaction
    });

    // Vorherige Einstellung finden
    const previousSetting = await MinijobSetting.findOne({
      where: {
        validFrom: { [Op.lt]: settingToDelete.validFrom },
        id: { [Op.ne]: settingToDelete.id }
      },
      order: [['validFrom', 'DESC']],
      transaction
    });

    // Intelligente Anpassung der vorherigen Einstellung
    if (previousSetting) {
      let newValidUntil = null; // Standard: unbegrenzt

      if (laterSettings.length > 0) {
        const nextSetting = laterSettings[0];
        newValidUntil = DateService.getDateBefore(nextSetting.validFrom);
      }

      const oldValidUntil = previousSetting.validUntil;
      await previousSetting.update({ validUntil: newValidUntil }, { transaction });

      adjustedSettings.push({
        id: previousSetting.id,
        description: previousSetting.description,
        oldValidUntil: oldValidUntil || 'unbegrenzt',
        newValidUntil: newValidUntil || 'unbegrenzt'
      });
    }

    return adjustedSettings;
  }

  /**
   * Validiert Einstellungs-Daten
   * @param {string} validFrom - Startdatum
   * @param {string} validUntil - Enddatum
   * @returns {Object} { isValid, error }
   */
  static validateSettingDates(validFrom, validUntil) {
    // Startdatum validieren
    const fromValidation = DateService.validateDateString(validFrom);
    if (!fromValidation.isValid) {
      return { isValid: false, error: `Ungültiges Startdatum: ${fromValidation.error}` };
    }

    // Startdatum darf nicht in der Vergangenheit liegen
    if (DateService.isDateInPast(validFrom)) {
      return { isValid: false, error: 'Startdatum darf nicht in der Vergangenheit liegen' };
    }

    // Enddatum validieren (falls vorhanden)
    if (validUntil) {
      const untilValidation = DateService.validateDateString(validUntil);
      if (!untilValidation.isValid) {
        return { isValid: false, error: `Ungültiges Enddatum: ${untilValidation.error}` };
      }

      // Enddatum muss nach Startdatum liegen
      if (validUntil <= validFrom) {
        return { isValid: false, error: 'Enddatum muss nach dem Startdatum liegen' };
      }
    }

    return { isValid: true };
  }
}

module.exports = MinijobService;