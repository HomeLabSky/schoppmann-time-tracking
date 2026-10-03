const { AppError } = require('../lib/errors');
const { Op } = require('sequelize');
const { User, TimeEntry, PeriodClosure, sequelize } = require('../models');
const DateService = require('./dateService');
const TimeEntryService = require('./timeEntryService');
const AuditService = require('./auditService');
const { overlaps } = require('./periodGuard');
const billing = require('../utils/billing');
const { todayString } = require('../utils/clock');

const MIN_REASON_LENGTH = 5;

const displayRange = (start, end) =>
  `${DateService.formatDateForDisplay(start)} – ${DateService.formatDateForDisplay(end)}`;

/** Eingefrorene Zahlen eines Abschlusses für das Änderungsprotokoll (Beträge in Euro). */
const closureSnapshot = (closure) => ({
  periodStart: closure.periodStart,
  periodEnd: closure.periodEnd,
  entryCount: closure.entryCount,
  totalMinutes: closure.totalMinutes,
  earnings: billing.toEuros(closure.earningsCents),
  limit: billing.toEuros(closure.limitCents),
  carryIn: billing.toEuros(closure.carryInCents),
  paid: billing.toEuros(closure.paidCents),
  carryOut: billing.toEuros(closure.carryOutCents)
});

/**
 * Monatsabschluss: Eine Abrechnungsperiode eines Mitarbeiters wird festgeschrieben.
 *
 * Regeln:
 * - abschließen erst nach Periodenende und nur, wenn frühere Perioden mit Einträgen
 *   bereits abgeschlossen sind (der Übertrag baut aufeinander auf);
 * - wieder öffnen nur mit Begründung und nur die jüngste abgeschlossene Periode;
 * - beides steht im Änderungsprotokoll, Zahlen werden beim Abschluss eingefroren.
 */
class PeriodService {
  /**
   * Zielperiode des Mitarbeiters für einen Referenzmonat (nach seinen aktuellen Einstellungen).
   * @private
   */
  static async resolveTarget(userId, year, month, options = {}) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'abrechnungStart', 'abrechnungEnde'],
      transaction: options.transaction
    });
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Benutzer nicht gefunden');
    }
    const startDay = user.abrechnungStart || 1;
    const endDay = user.abrechnungEnde || 31;
    const target = DateService.createBillingPeriod(startDay, endDay, `${year}-${String(month).padStart(2, '0')}-15`);
    return { user, startDay, endDay, target };
  }

  /**
   * Schließt eine Periode ab.
   * @param {number} userId Mitarbeiter
   * @param {number} year Referenzjahr
   * @param {number} month Referenzmonat (1-12)
   * @param {{id:number,email:string}} actor abschließender Admin
   * @returns {Promise<Object>} Abschluss mit eingefrorenen Zahlen
   */
  static async closePeriod(userId, year, month, actor) {
    return await sequelize.transaction(async (transaction) => {
      const { startDay, endDay, target } = await this.resolveTarget(userId, year, month, { transaction });

      if (todayString() <= target.endDate) {
        throw new AppError('PERIOD_NOT_ENDED',
          `Die Periode ${displayRange(target.startDate, target.endDate)} läuft noch ` +
          'und kann erst nach ihrem Ende abgeschlossen werden'
        );
      }

      const closures = await PeriodClosure.findAll({ where: { userId }, transaction });

      const same = closures.find((c) => c.periodStart === target.startDate && c.periodEnd === target.endDate);
      if (same) {
        throw new AppError('PERIOD_ALREADY_CLOSED', 'Diese Periode ist bereits abgeschlossen');
      }
      if (closures.some((c) => overlaps(target.startDate, target.endDate, c.periodStart, c.periodEnd))) {
        throw new AppError('PERIOD_OVERLAP',
          'Die Periode überschneidet sich mit einer bereits abgeschlossenen Periode ' +
          '(Abrechnungszeitraum des Mitarbeiters wurde geändert). Bitte zuerst die überschneidende Periode öffnen.'
        );
      }

      // Frühere Perioden mit Einträgen müssen vorher abgeschlossen sein
      const periods = await TimeEntryService.listPeriodsUpTo(userId, startDay, endDay, year, month, { transaction });
      for (const earlier of periods.slice(0, -1)) {
        const isClosed = closures.some((c) => overlaps(earlier.startDate, earlier.endDate, c.periodStart, c.periodEnd));
        if (isClosed) continue;
        const entries = await TimeEntry.count({
          where: { userId, date: { [Op.between]: [earlier.startDate, earlier.endDate] } },
          transaction
        });
        if (entries > 0) {
          throw new AppError('PERIOD_PREVIOUS_OPEN',
            `Bitte zuerst die frühere Periode ${displayRange(earlier.startDate, earlier.endDate)} abschließen`
          );
        }
      }

      const data = await TimeEntryService.getMonthlyTimeRecords(userId, year, month, { transaction });
      const s = data.summary;
      if (s.minijobLimitMissing) {
        throw new AppError('MINIJOB_LIMIT_MISSING',
          'Für diese Periode (oder eine frühere offene Periode im Übertrag) ist keine ' +
          'Minijob-Grenze hinterlegt. Bitte zuerst unter „Minijob“ eine Grenze für diesen Zeitraum anlegen.'
        );
      }

      const closure = await PeriodClosure.create({
        userId,
        periodStart: target.startDate,
        periodEnd: target.endDate,
        closedBy: actor?.id ?? null,
        closedAt: new Date(),
        entryCount: s.entryCount,
        totalMinutes: data.records.reduce((sum, r) => sum + r.workMinutes, 0),
        earningsCents: billing.toCents(s.totalEarnings),
        limitCents: billing.toCents(s.minijobLimit),
        carryInCents: billing.toCents(s.carryIn),
        paidCents: billing.toCents(s.paidThisMonth),
        carryOutCents: billing.toCents(s.carryOut)
      }, { transaction });

      await AuditService.record({
        actor,
        action: 'period.close',
        entityType: 'PeriodClosure',
        entityId: closure.id,
        targetUserId: userId,
        after: closureSnapshot(closure)
      }, { transaction });

      return closure.toJSON();
    });
  }

  /**
   * Öffnet eine abgeschlossene Periode wieder (nur mit Begründung).
   * @param {{id:number,email:string}} actor öffnender Admin
   */
  static async reopenPeriod(userId, year, month, reason, actor) {
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < MIN_REASON_LENGTH) {
      throw new AppError('REASON_REQUIRED', `Bitte eine Begründung angeben (mindestens ${MIN_REASON_LENGTH} Zeichen)`);
    }

    return await sequelize.transaction(async (transaction) => {
      const { target } = await this.resolveTarget(userId, year, month, { transaction });

      const closures = await PeriodClosure.findAll({ where: { userId }, order: [['periodStart', 'ASC']], transaction });
      const closure = closures.find((c) => overlaps(target.startDate, target.endDate, c.periodStart, c.periodEnd));
      if (!closure) {
        throw new AppError('PERIOD_NOT_CLOSED', 'Diese Periode ist nicht abgeschlossen');
      }

      const later = closures.find((c) => c.periodStart > closure.periodStart);
      if (later) {
        throw new AppError('PERIOD_LATER_CLOSED',
          `Zuerst die später abgeschlossene Periode ${displayRange(later.periodStart, later.periodEnd)} wieder öffnen`
        );
      }

      const before = closureSnapshot(closure);
      await closure.destroy({ transaction });

      await AuditService.record({
        actor,
        action: 'period.reopen',
        entityType: 'PeriodClosure',
        entityId: closure.id,
        targetUserId: userId,
        before,
        meta: { reason: cleanReason }
      }, { transaction });

      return { periodStart: before.periodStart, periodEnd: before.periodEnd };
    });
  }

  /** Alle aktuell abgeschlossenen Perioden eines Mitarbeiters (neueste zuerst). */
  static async listClosures(userId) {
    const rows = await PeriodClosure.findAll({ where: { userId }, order: [['periodStart', 'DESC']] });
    return rows.map((c) => c.toJSON());
  }
}

module.exports = PeriodService;
