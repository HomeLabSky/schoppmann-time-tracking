const { TimeEntry, User, MinijobSetting, sequelize } = require('../models');
const { Op } = require('sequelize');
const DateService = require('./dateService');

/**
 * ✅ Time Entry Service - Zeiterfassung Business Logic
 * Enthält alle Zeiterfassungs-bezogenen Operationen und Minijob-Berechnungen
 */
class TimeEntryService {

  /**
  * Holt alle Zeiteinträge für einen User und Monat mit Minijob-Berechnungen
  * GEÄNDERT: Berücksichtigt jetzt benutzerdefinierte Abrechnungsperioden
  * @param {number} userId - User ID
  * @param {number} year - Jahr
  * @param {number} month - Monat (1-12)
  * @returns {Promise<Object>} Zeiteinträge mit Minijob-Übersicht
  */
  static async getMonthlyTimeRecords(userId, year, month) {
    try {
      // GEÄNDERT: User mit Abrechnungseinstellungen laden
      const user = await User.findByPk(userId, {
        attributes: ['id', 'name', 'email', 'stundenlohn', 'abrechnungStart', 'abrechnungEnde']
      });

      if (!user) {
        throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
      }

      // GEÄNDERT: Abrechnungsperiode des Benutzers ermitteln (Default: 1-31)
      const startDay = user.abrechnungStart || 1;
      const endDay = user.abrechnungEnde || 31;

      // GEÄNDERT: Prüfen ob benutzerdefinierte Abrechnungsperiode verwendet wird
      const useCustomPeriod = (startDay !== 1 || endDay !== 31);

      let entries, billingPeriod;

      if (useCustomPeriod) {
        // Benutzerdefinierte Abrechnungsperiode verwenden
        const referenceDate = `${year}-${month.toString().padStart(2, '0')}-15`;
        billingPeriod = DateService.createBillingPeriod(startDay, endDay, referenceDate);

        console.log(`📅 Benutzerdefinierte Abrechnungsperiode für ${user.email}: ${billingPeriod.startDate} bis ${billingPeriod.endDate}`);

        // Zeiteinträge für die Abrechnungsperiode laden
        entries = await TimeEntry.findAll({
          where: {
            userId,
            date: {
              [Op.between]: [billingPeriod.startDate, billingPeriod.endDate]
            }
          },
          include: [{
            model: User,
            as: 'User',
            attributes: ['name', 'email', 'stundenlohn']
          }],
          order: [['date', 'ASC']]
        });
      } else {
        // Standard-Kalendermonat verwenden (wie vorher)
        const monthlyStats = await TimeEntry.calculateMonthlyStats(userId, year, month);
        entries = monthlyStats.entries;

        // Standard-Periode für Anzeige
        billingPeriod = {
          startDate: `${year}-${month.toString().padStart(2, '0')}-01`,
          endDate: new Date(year, month, 0).toISOString().split('T')[0],
          description: `${month}/${year} (Kalendermonat)`
        };
      }

      // Statistiken berechnen (gleiche Logik wie vorher)
      let totalMinutes = 0;
      let totalEarnings = 0;

      entries.forEach(entry => {
        totalMinutes += entry.workMinutes;
        totalEarnings += entry.earnings;
      });

      const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

      const currentMinijobSetting = await MinijobSetting.getCurrentSetting();
      const minijobLimit = currentMinijobSetting ? currentMinijobSetting.monthlyLimit : 550.00;
      const hourlyRate = user.stundenlohn || 12.00;

      // Übertrag aus Vormonat berechnen
      const carryIn = await this.calculateCarryIn(userId, year, month, minijobLimit);
      const actualEarnings = totalEarnings + carryIn;
      const paidThisMonth = Math.min(actualEarnings, minijobLimit);
      const carryOut = Math.max(0, actualEarnings - minijobLimit);

      // Formatierte Einträge
      const formattedEntries = entries.map(entry => entry.toSafeJSON());

      return {
        records: formattedEntries,
        summary: {
          totalHours: totalHours,
          totalEarnings: Math.round(totalEarnings * 100) / 100,
          actualEarnings: Math.round(actualEarnings * 100) / 100,
          carryIn: Math.round(carryIn * 100) / 100,
          carryOut: Math.round(carryOut * 100) / 100,
          paidThisMonth: Math.round(paidThisMonth * 100) / 100,
          minijobLimit: minijobLimit,
          hourlyRate: hourlyRate,
          exceedsLimit: actualEarnings > minijobLimit,
          entryCount: formattedEntries.length
        },
        // GEÄNDERT: Korrekte Periodeninformationen verwenden
        period: {
          year,
          month,
          monthName: this.getMonthName(month),
          startDate: billingPeriod.startDate,
          endDate: billingPeriod.endDate,
          description: billingPeriod.description
        }
      };
    } catch (error) {
      throw new Error(`MONTHLY_RECORDS_ERROR:${error.message}`);
    }
  }

  /**
  * Berechnet den Übertrag aus dem Vormonat
  * GEÄNDERT: Berücksichtigt jetzt benutzerdefinierte Abrechnungsperioden
  * @param {number} userId - User ID
  * @param {number} year - Jahr
  * @param {number} month - Monat
  * @param {number} minijobLimit - Aktuelle Minijob-Grenze
  * @returns {Promise<number>} Übertrag aus Vormonat
  */
  static async calculateCarryIn(userId, year, month, minijobLimit) {
    try {
      // GEÄNDERT: User-Abrechnungseinstellungen laden
      const user = await User.findByPk(userId, {
        attributes: ['abrechnungStart', 'abrechnungEnde']
      });

      if (!user) return 0;

      const startDay = user.abrechnungStart || 1;
      const endDay = user.abrechnungEnde || 31;

      let carryIn = 0;

      // Startmonat der Zeiterfassung finden
      const firstEntry = await TimeEntry.findOne({
        where: { userId },
        order: [['date', 'ASC']],
        attributes: ['date']
      });

      if (!firstEntry) return 0;

      const firstDate = new Date(firstEntry.date);
      let currentYear = firstDate.getFullYear();
      let currentMonth = firstDate.getMonth() + 1; // getMonth() ist 0-basiert

      // Bis zum gewünschten Monat durchgehen
      while (currentYear < year || (currentYear === year && currentMonth < month)) {

        // GEÄNDERT: Korrekte Abrechnungsperiode für aktuellen Monat berechnen
        const referenceDate = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-15`;
        const billingPeriod = DateService.createBillingPeriod(startDay, endDay, referenceDate);

        // GEÄNDERT: Einträge für diese Abrechnungsperiode laden (nicht Kalendermonat!)
        const entries = await TimeEntry.findAll({
          where: {
            userId,
            date: {
              [Op.between]: [billingPeriod.startDate, billingPeriod.endDate]
            }
          }
        });

        // Verdienst für diese Periode berechnen
        const monthlyEarnings = entries.reduce((sum, entry) => sum + entry.earnings, 0);
        const totalForPeriod = monthlyEarnings + carryIn;
        const paidForPeriod = Math.min(totalForPeriod, minijobLimit);

        carryIn = Math.max(0, totalForPeriod - minijobLimit);

        console.log(`💰 Übertrag-Berechnung ${currentYear}-${currentMonth}: Verdienst=${monthlyEarnings.toFixed(2)}€, Übertrag=${carryIn.toFixed(2)}€`);

        // Nächster Monat
        if (currentMonth === 12) {
          currentYear++;
          currentMonth = 1;
        } else {
          currentMonth++;
        }
      }

      return carryIn;
    } catch (error) {
      console.error('Fehler beim Berechnen des Übertrags:', error);
      return 0;
    }
  }

  /**
   * Erstellt einen neuen Zeiteintrag
   * @param {Object} entryData - Zeiteintrag-Daten
   * @returns {Promise<Object>} Erstellter Zeiteintrag
   */
  static async createTimeEntry(entryData) {
    const transaction = await sequelize.transaction();

    try {
      // Validierung
      const validation = TimeEntry.validateTimeEntry(entryData);
      if (!validation.isValid) {
        throw new Error(`VALIDATION_ERROR:${validation.errors.join(', ')}`);
      }

      // Prüfen ob bereits ein Eintrag für diesen Tag existiert
      const existingEntry = await TimeEntry.findOne({
        where: {
          userId: entryData.userId,
          date: entryData.date
        },
        transaction
      });

      if (existingEntry) {
        throw new Error('ENTRY_EXISTS:Für dieses Datum existiert bereits ein Zeiteintrag');
      }

      // Zeiten normalisieren (HH:mm Format sicherstellen)
      const normalizedData = {
        ...entryData,
        startTime: this.normalizeTime(entryData.startTime),
        endTime: this.normalizeTime(entryData.endTime),
        breakMinutes: entryData.breakMinutes || 30
      };

      // Eintrag erstellen
      const newEntry = await TimeEntry.create(normalizedData, { transaction });

      // User-Daten für Berechnung laden
      const user = await User.findByPk(entryData.userId, { transaction });
      newEntry.User = user; // Für virtuelle Eigenschaften

      await transaction.commit();

      return newEntry.toSafeJSON();
    } catch (error) {
      await transaction.rollback();
      throw new Error(`CREATE_ENTRY_ERROR:${error.message}`);
    }
  }

  /**
   * Aktualisiert einen Zeiteintrag
   * @param {number} entryId - Eintrag ID
   * @param {Object} updateData - Update-Daten
   * @param {number} userId - User ID (für Sicherheit)
   * @returns {Promise<Object>} Aktualisierter Zeiteintrag
   */
  static async updateTimeEntry(entryId, updateData, userId) {
    const transaction = await sequelize.transaction();

    try {
      const entry = await TimeEntry.findOne({
        where: {
          id: entryId,
          userId: userId // Sicherstellen dass User nur eigene Einträge bearbeitet
        },
        include: [{ model: User, as: 'User' }],
        transaction
      });

      if (!entry) {
        throw new Error('ENTRY_NOT_FOUND:Zeiteintrag nicht gefunden');
      }

      // Validierung der Update-Daten
      const validation = TimeEntry.validateTimeEntry({
        ...entry.get(),
        ...updateData,
        userId: userId // Sicherstellen dass userId nicht überschrieben wird
      });

      if (!validation.isValid) {
        throw new Error(`VALIDATION_ERROR:${validation.errors.join(', ')}`);
      }

      // Zeiten normalisieren
      const normalizedData = { ...updateData };
      if (updateData.startTime) {
        normalizedData.startTime = this.normalizeTime(updateData.startTime);
      }
      if (updateData.endTime) {
        normalizedData.endTime = this.normalizeTime(updateData.endTime);
      }

      // Eintrag aktualisieren
      await entry.update(normalizedData, { transaction });

      await transaction.commit();

      return entry.toSafeJSON();
    } catch (error) {
      await transaction.rollback();
      throw new Error(`UPDATE_ENTRY_ERROR:${error.message}`);
    }
  }

  /**
   * Löscht einen Zeiteintrag
   * @param {number} entryId - Eintrag ID
   * @param {number} userId - User ID (für Sicherheit)
   * @returns {Promise<boolean>} True bei Erfolg
   */
  static async deleteTimeEntry(entryId, userId) {
    const transaction = await sequelize.transaction();

    try {
      const entry = await TimeEntry.findOne({
        where: {
          id: entryId,
          userId: userId
        },
        transaction
      });

      if (!entry) {
        throw new Error('ENTRY_NOT_FOUND:Zeiteintrag nicht gefunden');
      }

      await entry.destroy({ transaction });
      await transaction.commit();

      return true;
    } catch (error) {
      await transaction.rollback();
      throw new Error(`DELETE_ENTRY_ERROR:${error.message}`);
    }
  }

  /**
   * Holt einen einzelnen Zeiteintrag
   * @param {number} entryId - Eintrag ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Zeiteintrag
   */
  static async getTimeEntry(entryId, userId) {
    try {
      const entry = await TimeEntry.findOne({
        where: {
          id: entryId,
          userId: userId
        },
        include: [{ model: User, as: 'User' }]
      });

      if (!entry) {
        throw new Error('ENTRY_NOT_FOUND:Zeiteintrag nicht gefunden');
      }

      return entry.toSafeJSON();
    } catch (error) {
      throw new Error(`GET_ENTRY_ERROR:${error.message}`);
    }
  }

  /**
   * Berechnet Statistiken für mehrere Monate
   * @param {number} userId - User ID
   * @param {number} monthsBack - Anzahl Monate zurück
   * @returns {Promise<Object>} Statistiken
   */
  static async getMultiMonthStats(userId, monthsBack = 12) {
    try {
      const stats = [];
      const currentDate = new Date();

      for (let i = 0; i < monthsBack; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        const monthData = await this.getMonthlyTimeRecords(userId, year, month);
        stats.push({
          year,
          month,
          monthName: this.getMonthName(month),
          ...monthData.summary
        });
      }

      return {
        monthlyStats: stats.reverse(), // Chronologisch sortieren
        totalStats: {
          totalHours: stats.reduce((sum, stat) => sum + stat.totalHours, 0),
          totalEarnings: stats.reduce((sum, stat) => sum + stat.totalEarnings, 0),
          averageMonthlyHours: stats.length > 0 ? stats.reduce((sum, stat) => sum + stat.totalHours, 0) / stats.length : 0
        }
      };
    } catch (error) {
      throw new Error(`MULTI_MONTH_STATS_ERROR:${error.message}`);
    }
  }

  /**
   * Normalisiert Zeit-String zu HH:mm:ss Format
   * @param {string} timeString - Zeit als String
   * @returns {string} Normalisierte Zeit
   */
  static normalizeTime(timeString) {
    if (!timeString) return '00:00:00';

    // Entferne Leerzeichen
    const cleaned = timeString.trim();

    // Wenn bereits im HH:mm:ss Format
    if (/^\d{2}:\d{2}:\d{2}$/.test(cleaned)) {
      return cleaned;
    }

    // Wenn im HH:mm Format
    if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
      const [hours, minutes] = cleaned.split(':');
      return `${hours.padStart(2, '0')}:${minutes}:00`;
    }

    throw new Error(`Ungültiges Zeitformat: ${timeString}`);
  }

  /**
   * Gibt deutschen Monatsnamen zurück
   * @param {number} month - Monat (1-12)
   * @returns {string} Monatsname
   */
  static getMonthName(month) {
    const months = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    return months[month - 1] || 'Unbekannt';
  }

  /**
 * Generiert Abrechnungsperioden für Dropdown
 * GEÄNDERT: Berücksichtigt jetzt benutzerdefinierte Abrechnungsperioden
 */
  static async generateBillingPeriods(userId, monthsBack = 12, monthsForward = 3) {
    try {
      // GEÄNDERT: User-Abrechnungseinstellungen laden
      const user = await User.findByPk(userId, {
        attributes: ['abrechnungStart', 'abrechnungEnde']
      });

      // Fallback auf Standard-Perioden wenn User nicht gefunden
      const startDay = user ? (user.abrechnungStart || 1) : 1;
      const endDay = user ? (user.abrechnungEnde || 31) : 31;

      const periods = [];
      const currentDate = new Date();

      // Vergangenheit
      for (let i = monthsBack; i > 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 15);
        periods.push(await this.createPeriodObjectForUser(date, startDay, endDay));
      }

      // Aktueller Monat
      periods.push(await this.createPeriodObjectForUser(currentDate, startDay, endDay));

      // Zukunft
      for (let i = 1; i <= monthsForward; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 15);
        periods.push(await this.createPeriodObjectForUser(date, startDay, endDay));
      }

      return periods;
    } catch (error) {
      console.error('Fehler beim Generieren der Abrechnungsperioden:', error);
      // Fallback auf Standard-Kalendermonate bei Fehlern
      return this.generateStandardBillingPeriods(monthsBack, monthsForward);
    }
  }

  /**
   * Erstellt benutzerspezifisches Perioden-Objekt
   * NEUE HILFSMETHODE
   */
  static async createPeriodObjectForUser(date, startDay, endDay) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = this.getMonthName(month);

    // Korrekte Abrechnungsperiode berechnen
    const referenceDate = `${year}-${month.toString().padStart(2, '0')}-15`;
    const billingPeriod = DateService.createBillingPeriod(startDay, endDay, referenceDate);

    return {
      value: `${year}-${month.toString().padStart(2, '0')}`,
      label: `${monthName} ${year} (${DateService.formatDateForDisplay(billingPeriod.startDate)} – ${DateService.formatDateForDisplay(billingPeriod.endDate)})`,
      year,
      month,
      monthName,
      startDate: billingPeriod.startDate,
      endDate: billingPeriod.endDate,
      isCurrent: year === new Date().getFullYear() && month === new Date().getMonth() + 1
    };
  }

  /**
   * Fallback-Methode für Standard-Kalendermonate
   * NEUE HILFSMETHODE
   */
  static generateStandardBillingPeriods(monthsBack = 12, monthsForward = 3) {
    const periods = [];
    const currentDate = new Date();

    for (let i = monthsBack; i > 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      periods.push(this.createPeriodObject(date)); // Alte Methode verwenden
    }

    periods.push(this.createPeriodObject(currentDate));

    for (let i = 1; i <= monthsForward; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
      periods.push(this.createPeriodObject(date));
    }

    return periods;
  }

  /**
   * Erstellt Perioden-Objekt für Dropdown
   * @param {Date} date - Datum
   * @returns {Object} Perioden-Objekt
   */
  static createPeriodObject(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = this.getMonthName(month);

    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    return {
      value: `${year}-${month.toString().padStart(2, '0')}`,
      label: `${monthName} ${year} (${DateService.formatDateForDisplay(startDate)} – ${DateService.formatDateForDisplay(endDate)})`,
      year,
      month,
      monthName,
      startDate,
      endDate,
      isCurrent: year === new Date().getFullYear() && month === new Date().getMonth() + 1
    };
  }
}

module.exports = TimeEntryService;