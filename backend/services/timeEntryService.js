const { TimeEntry, User, MinijobSetting, PeriodClosure, sequelize } = require('../models');
const { Op } = require('sequelize');
const DateService = require('./dateService');
const AuditService = require('./auditService');
const { assertDateOpen, overlaps } = require('./periodGuard');
const billing = require('../utils/billing');
const { todayString } = require('../utils/clock');

/** Referenzdatum (Monatsmitte) einer Abrechnungsperiode */
const referenceDate = (year, month) => `${year}-${String(month).padStart(2, '0')}-15`;

/** Für das Änderungsprotokoll: nur fachlich relevante Felder, Zeiten als HH:mm. */
const entrySnapshot = (entry) => ({
  date: entry.date,
  startTime: String(entry.startTime).substring(0, 5),
  endTime: String(entry.endTime).substring(0, 5),
  breakMinutes: entry.breakMinutes,
  description: entry.description || null,
  hourlyRateCents: entry.hourlyRateCents
});

/** Auslöser für das Protokoll; ohne Angabe gilt der Mitarbeiter selbst. */
const resolveActor = (actor, userId) => actor || { id: userId };

/**
 * ✅ Time Entry Service - Zeiterfassung Business Logic
 * Enthält alle Zeiterfassungs-bezogenen Operationen und Minijob-Berechnungen.
 * Die reine Rechenlogik (Cent-Beträge, Übertrag, Fachregeln) liegt in utils/billing.js.
 * Jede Änderung wird in derselben Transaktion im Änderungsprotokoll festgehalten
 * und ist in abgeschlossenen Perioden gesperrt.
 */
class TimeEntryService {

  /**
   * Alle Abrechnungsperioden vom Monat des ersten Eintrags bis einschließlich der
   * Zielperiode (chronologisch). Ohne frühere Einträge nur die Zielperiode.
   * @returns {Promise<Array<{startDate:string,endDate:string,description:string}>>}
   */
  static async listPeriodsUpTo(userId, startDay, endDay, year, month, options = {}) {
    const target = DateService.createBillingPeriod(startDay, endDay, referenceDate(year, month));

    const first = await TimeEntry.findOne({
      where: { userId, date: { [Op.lt]: target.startDate } },
      order: [['date', 'ASC']],
      attributes: ['date'],
      transaction: options.transaction
    });
    if (!first) return [target];

    let [currentYear, currentMonth, firstDay] = first.date.split('-').map(Number);

    // Bei periodenübergreifenden Abrechnungen (z. B. 22.–21.) gehört ein Eintrag vor
    // dem Starttag noch zur Periode des Vormonats.
    if (startDay > endDay && firstDay < startDay) {
      currentMonth -= 1;
      if (currentMonth === 0) {
        currentMonth = 12;
        currentYear -= 1;
      }
    }

    const periods = [];
    // 600 Monate = 50 Jahre; früher brach die Schleife nach 50 Monaten ab und
    // verfälschte den Übertrag bei langen Beschäftigungen.
    for (let i = 0; i < 600; i++) {
      const period = DateService.createBillingPeriod(startDay, endDay, referenceDate(currentYear, currentMonth));
      if (period.startDate >= target.startDate) break;
      periods.push(period);
      currentMonth += 1;
      if (currentMonth === 13) {
        currentMonth = 1;
        currentYear += 1;
      }
    }
    periods.push(target);
    return periods;
  }

  /**
   * Holt alle Zeiteinträge für einen User und eine Abrechnungsperiode inkl.
   * Minijob-Übersicht. Der Übertrag wird über alle früheren Perioden mit jeweils
   * der damals gültigen Minijob-Grenze und den damals eingefrorenen Stundensätzen
   * berechnet. Für abgeschlossene Perioden gelten die beim Abschluss eingefrorenen
   * Zahlen (spätere Änderungen an Grenzen verändern sie nicht).
   * @param {number} userId - User ID
   * @param {number} year - Referenzjahr
   * @param {number} month - Referenzmonat (1-12)
   * @param {{transaction?: Object}} [options]
   * @returns {Promise<Object>} Zeiteinträge mit Minijob-Übersicht
   */
  static async getMonthlyTimeRecords(userId, year, month, options = {}) {
    const { transaction } = options;
    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'name', 'email', 'stundenlohn', 'abrechnungStart', 'abrechnungEnde'],
        transaction
      });

      if (!user) {
        throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
      }

      const startDay = user.abrechnungStart || 1;
      const endDay = user.abrechnungEnde || 31;

      const periods = await this.listPeriodsUpTo(userId, startDay, endDay, year, month, { transaction });
      const target = periods[periods.length - 1];

      const settings = await MinijobSetting.findAll({ raw: true, transaction });
      const closures = await PeriodClosure.findAll({ where: { userId }, raw: true, transaction });
      const entries = await TimeEntry.findAll({
        where: { userId, date: { [Op.between]: [periods[0].startDate, target.endDate] } },
        order: [['date', 'ASC']],
        transaction
      });

      const closureFor = (period) =>
        closures.find((c) => overlaps(period.startDate, period.endDate, c.periodStart, c.periodEnd)) || null;

      const rows = periods.map((period) => {
        const own = entries.filter((e) => e.date >= period.startDate && e.date <= period.endDate);
        const closure = closureFor(period);
        return {
          period,
          closure,
          entries: own,
          // Abgeschlossene Perioden: eingefrorene Werte statt Neuberechnung
          minutes: closure ? closure.totalMinutes : own.reduce((sum, e) => sum + e.workMinutes, 0),
          earningsCents: closure ? closure.earningsCents : own.reduce((sum, e) => sum + e.earningsCents, 0),
          limitCents: closure ? closure.limitCents : billing.limitCentsForDate(settings, period.endDate)
        };
      });
      const folded = billing.foldCarry(rows);

      const current = rows[rows.length - 1];
      const result = folded[folded.length - 1];
      const closure = current.closure;
      const hourlyRate = user.stundenlohn == null ? billing.toEuros(billing.DEFAULT_HOURLY_RATE_CENTS) : Number(user.stundenlohn);

      // Display-Werte (Benennung nach End- bzw. Referenzmonat)
      const periodInfo = TimeEntryService.createPeriodObjectForUser(
        new Date(referenceDate(year, month)),
        startDay,
        endDay
      );

      return {
        records: current.entries.map((entry) => entry.toSafeJSON()),
        summary: {
          totalHours: Math.round((current.minutes / 60) * 100) / 100,
          totalEarnings: billing.toEuros(current.earningsCents),
          actualEarnings: billing.toEuros(result.actualCents),
          carryIn: billing.toEuros(result.carryInCents),
          carryOut: billing.toEuros(result.carryOutCents),
          paidThisMonth: billing.toEuros(result.paidCents),
          minijobLimit: billing.toEuros(result.limitCents),
          hourlyRate,
          exceedsLimit: result.actualCents > result.limitCents,
          entryCount: current.entries.length
        },
        period: {
          year: periodInfo.year,
          month: periodInfo.month,
          monthName: periodInfo.monthName,
          startDate: target.startDate,
          endDate: target.endDate,
          description: target.description,
          status: closure ? 'closed' : 'open'
        },
        closure: closure
          ? {
            closedAt: closure.closedAt,
            closedBy: closure.closedBy,
            periodStart: closure.periodStart,
            periodEnd: closure.periodEnd
          }
          : null
      };
    } catch (error) {
      throw new Error(`MONTHLY_RECORDS_ERROR:${error.message}`);
    }
  }

  /**
   * Erstellt einen neuen Zeiteintrag. Der aktuelle Stundenlohn des Mitarbeiters wird
   * im Eintrag eingefroren; spätere Lohnänderungen wirken nicht rückwirkend.
   * @param {Object} entryData - { userId, date, startTime, endTime, breakMinutes?, description? }
   * @param {{id:number,email?:string}} [actor] Auslöser für das Protokoll
   * @returns {Promise<Object>} Erstellter Zeiteintrag
   */
  static async createTimeEntry(entryData, actor) {
    const transaction = await sequelize.transaction();

    try {
      const validation = TimeEntry.validateTimeEntry(entryData);
      if (!validation.isValid) {
        throw new Error(`VALIDATION_ERROR:${validation.errors.join(', ')}`);
      }

      // Nur gewünschte Felder übernehmen (kein Mass-Assignment, z. B. von hourlyRateCents)
      const startTime = this.normalizeTime(entryData.startTime);
      const endTime = this.normalizeTime(entryData.endTime);
      const breakMinutes = billing.resolveBreakMinutes(entryData.breakMinutes);

      const ruleErrors = billing.validateEntryRules(
        { date: entryData.date, startTime, endTime, breakMinutes },
        { today: todayString(), checkDateWindow: true }
      );
      if (ruleErrors.length > 0) {
        throw new Error(`VALIDATION_ERROR:${ruleErrors.join(', ')}`);
      }

      await assertDateOpen(entryData.userId, entryData.date, { transaction });

      const existingEntry = await TimeEntry.findOne({
        where: { userId: entryData.userId, date: entryData.date },
        transaction
      });
      if (existingEntry) {
        throw new Error('ENTRY_EXISTS:Für dieses Datum existiert bereits ein Zeiteintrag');
      }

      const user = await User.findByPk(entryData.userId, { transaction });
      if (!user) {
        throw new Error('USER_NOT_FOUND:Benutzer nicht gefunden');
      }

      const newEntry = await TimeEntry.create({
        userId: entryData.userId,
        date: entryData.date,
        startTime,
        endTime,
        breakMinutes,
        description: entryData.description || null,
        hourlyRateCents: user.stundenlohn == null
          ? billing.DEFAULT_HOURLY_RATE_CENTS
          : billing.toCents(user.stundenlohn)
      }, { transaction });

      await AuditService.record({
        actor: resolveActor(actor, entryData.userId),
        action: 'time_entry.create',
        entityType: 'TimeEntry',
        entityId: newEntry.id,
        targetUserId: entryData.userId,
        after: entrySnapshot(newEntry)
      }, { transaction });

      await transaction.commit();

      return newEntry.toSafeJSON();
    } catch (error) {
      await transaction.rollback();
      throw new Error(`CREATE_ENTRY_ERROR:${error.message}`);
    }
  }

  /**
   * Aktualisiert einen Zeiteintrag (Datum und eingefrorener Stundensatz bleiben unverändert).
   * @param {number} entryId - Eintrag ID
   * @param {Object} updateData - { startTime?, endTime?, breakMinutes?, description? }
   * @param {number} userId - User ID (für Sicherheit)
   * @param {{id:number,email?:string}} [actor] Auslöser für das Protokoll
   * @returns {Promise<Object>} Aktualisierter Zeiteintrag
   */
  static async updateTimeEntry(entryId, updateData, userId, actor) {
    const transaction = await sequelize.transaction();

    try {
      const entry = await TimeEntry.findOne({
        where: { id: entryId, userId }, // Nutzer bearbeiten nur eigene Einträge
        transaction
      });

      if (!entry) {
        throw new Error('ENTRY_NOT_FOUND:Zeiteintrag nicht gefunden');
      }

      await assertDateOpen(userId, entry.date, { transaction });

      const merged = {
        userId,
        date: entry.date,
        startTime: updateData.startTime ? this.normalizeTime(updateData.startTime) : entry.startTime,
        endTime: updateData.endTime ? this.normalizeTime(updateData.endTime) : entry.endTime,
        breakMinutes: updateData.breakMinutes === undefined || updateData.breakMinutes === null
          ? entry.breakMinutes
          : parseInt(updateData.breakMinutes, 10)
      };

      const validation = TimeEntry.validateTimeEntry(merged);
      if (!validation.isValid) {
        throw new Error(`VALIDATION_ERROR:${validation.errors.join(', ')}`);
      }
      const ruleErrors = billing.validateEntryRules(merged, { today: todayString() });
      if (ruleErrors.length > 0) {
        throw new Error(`VALIDATION_ERROR:${ruleErrors.join(', ')}`);
      }

      const before = entrySnapshot(entry);

      await entry.update({
        startTime: merged.startTime,
        endTime: merged.endTime,
        breakMinutes: merged.breakMinutes,
        ...(updateData.description !== undefined && { description: updateData.description || null })
      }, { transaction });

      await AuditService.record({
        actor: resolveActor(actor, userId),
        action: 'time_entry.update',
        entityType: 'TimeEntry',
        entityId: entry.id,
        targetUserId: userId,
        before,
        after: entrySnapshot(entry)
      }, { transaction });

      await transaction.commit();

      return entry.toSafeJSON();
    } catch (error) {
      await transaction.rollback();
      throw new Error(`UPDATE_ENTRY_ERROR:${error.message}`);
    }
  }

  /**
   * Löscht einen Zeiteintrag (der gelöschte Zustand bleibt im Änderungsprotokoll erhalten)
   * @param {number} entryId - Eintrag ID
   * @param {number} userId - User ID (für Sicherheit)
   * @param {{id:number,email?:string}} [actor] Auslöser für das Protokoll
   * @returns {Promise<boolean>} True bei Erfolg
   */
  static async deleteTimeEntry(entryId, userId, actor) {
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

      await assertDateOpen(userId, entry.date, { transaction });

      const before = entrySnapshot(entry);
      await entry.destroy({ transaction });

      await AuditService.record({
        actor: resolveActor(actor, userId),
        action: 'time_entry.delete',
        entityType: 'TimeEntry',
        entityId: entryId,
        targetUserId: userId,
        before
      }, { transaction });

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
        }
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

    const cleaned = timeString.trim();

    if (/^\d{2}:\d{2}:\d{2}$/.test(cleaned)) {
      return cleaned;
    }

    if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
      const [hours, minutes] = cleaned.split(':');
      return `${hours.padStart(2, '0')}:${minutes}:00`;
    }

    throw new Error(`VALIDATION_ERROR:Ungültiges Zeitformat: ${timeString}`);
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
   * Erzeugt überlappungsfreie Abrechnungsperioden für das Dropdown
   * (inkl. Kennzeichen `isClosed` für abgeschlossene Perioden).
   */
  static async generateBillingPeriods(userId, monthsBack = 12, monthsForward = 3) {
    try {
      const user = await User.findByPk(userId, {
        attributes: ['abrechnungStart', 'abrechnungEnde']
      });

      const startDay = user ? (user.abrechnungStart || 1) : 1;
      const endDay = user ? (user.abrechnungEnde || 31) : 31;

      const periods = [];
      const currentDate = new Date();

      // Für periodenübergreifende Abrechnungen (22.-21.): Starte früher
      const baseMonth = startDay > endDay ? currentDate.getMonth() - 1 : currentDate.getMonth();

      for (let i = monthsBack; i > 0; i--) {
        const date = new Date(currentDate.getFullYear(), baseMonth - i, 15);
        periods.push(TimeEntryService.createPeriodObjectForUser(date, startDay, endDay));
      }

      periods.push(TimeEntryService.createPeriodObjectForUser(
        new Date(currentDate.getFullYear(), baseMonth, 15), startDay, endDay
      ));

      for (let i = 1; i <= monthsForward; i++) {
        const date = new Date(currentDate.getFullYear(), baseMonth + i, 15);
        periods.push(TimeEntryService.createPeriodObjectForUser(date, startDay, endDay));
      }

      const uniquePeriods = periods.filter((period, index, self) =>
        index === self.findIndex((p) => p.value === period.value)
      );

      uniquePeriods.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      const closures = await PeriodClosure.findAll({ where: { userId }, raw: true });
      uniquePeriods.forEach((p) => {
        p.isClosed = closures.some((c) => overlaps(p.startDate, p.endDate, c.periodStart, c.periodEnd));
      });

      return uniquePeriods;
    } catch (error) {
      console.error('Fehler beim Generieren der Abrechnungsperioden:', error);
      return TimeEntryService.generateStandardBillingPeriods(monthsBack, monthsForward);
    }
  }

  /**
   * Erstellt benutzerspezifisches Perioden-Objekt.
   * Periodenübergreifende Abrechnungen werden nach dem Endmonat benannt
   * (22.7.–21.8. → "August"), monatsinterne nach dem Referenzmonat.
   * `isCurrent` prüft, ob der heutige Berliner Kalendertag in der Periode liegt.
   */
  static createPeriodObjectForUser(date, startDay, endDay) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const billingPeriod = DateService.createBillingPeriod(startDay, endDay, referenceDate(year, month));

    let displayYear, displayMonth, displayMonthName;

    if (startDay > endDay) {
      const endDate = new Date(billingPeriod.endDate + 'T12:00:00.000Z');
      displayYear = endDate.getUTCFullYear();
      displayMonth = endDate.getUTCMonth() + 1;
      displayMonthName = TimeEntryService.getMonthName(displayMonth);
    } else {
      displayYear = year;
      displayMonth = month;
      displayMonthName = TimeEntryService.getMonthName(month);
    }

    const today = todayString();
    const isCurrentPeriod = today >= billingPeriod.startDate && today <= billingPeriod.endDate;

    return {
      // Value bleibt der Referenzmonat – das Backend berechnet daraus die Periode
      value: `${year}-${month.toString().padStart(2, '0')}`,
      label: `${displayMonthName} ${displayYear} (${DateService.formatDateForDisplay(billingPeriod.startDate)} – ${DateService.formatDateForDisplay(billingPeriod.endDate)})`,
      year: displayYear,
      month: displayMonth,
      monthName: displayMonthName,
      startDate: billingPeriod.startDate,
      endDate: billingPeriod.endDate,
      referenceMonth: month,
      referenceYear: year,
      isCurrent: isCurrentPeriod
    };
  }

  /**
   * Fallback-Methode für Standard-Kalendermonate
   */
  static generateStandardBillingPeriods(monthsBack = 12, monthsForward = 3) {
    const periods = [];
    const currentDate = new Date();

    for (let i = monthsBack; i > 0; i--) {
      periods.push(TimeEntryService.createPeriodObject(new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1)));
    }

    periods.push(TimeEntryService.createPeriodObject(currentDate));

    for (let i = 1; i <= monthsForward; i++) {
      periods.push(TimeEntryService.createPeriodObject(new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1)));
    }

    return periods;
  }

  /**
   * Standard-Kalenderperiode (Fallback). Das Monatsende kommt aus
   * createBillingPeriod (UTC-sicher); `new Date(y, m, 0).toISOString()` lieferte
   * in Europe/Berlin den Vortag.
   */
  static createPeriodObject(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = TimeEntryService.getMonthName(month);

    const { startDate, endDate } = DateService.createBillingPeriod(1, 31, referenceDate(year, month));

    const today = todayString();
    const isCurrentPeriod = today >= startDate && today <= endDate;

    return {
      value: `${year}-${month.toString().padStart(2, '0')}`,
      label: `${monthName} ${year} (${DateService.formatDateForDisplay(startDate)} – ${DateService.formatDateForDisplay(endDate)})`,
      year,
      month,
      monthName,
      startDate,
      endDate,
      isCurrent: isCurrentPeriod
    };
  }
}

module.exports = TimeEntryService;
