const { AppError } = require('../lib/errors');
const { Op } = require('sequelize');
const { PeriodClosure } = require('../models');
const DateService = require('./dateService');

/**
 * Prüfungen rund um abgeschlossene Abrechnungsperioden.
 * Bewusst eigenes Modul (nur Model-Zugriff), damit Zeiterfassung und Abschluss-Service
 * sich nicht gegenseitig importieren müssen.
 */

/** Liegt der Zeitraum [a1,a2] teilweise in [b1,b2]? (alles YYYY-MM-DD) */
const overlaps = (a1, a2, b1, b2) => a1 <= b2 && a2 >= b1;

/** Abschluss, der das Datum abdeckt (oder null). */
const findClosureCovering = (userId, date, options = {}) =>
  PeriodClosure.findOne({
    where: { userId, periodStart: { [Op.lte]: date }, periodEnd: { [Op.gte]: date } },
    transaction: options.transaction
  });

/**
 * Wirft PERIOD_CLOSED, wenn das Datum in einer abgeschlossenen Periode liegt.
 * Gilt für Anlegen, Ändern und Löschen von Zeiteinträgen.
 */
const assertDateOpen = async (userId, date, options = {}) => {
  const closure = await findClosureCovering(userId, date, options);
  if (closure) {
    const range = `${DateService.formatDateForDisplay(closure.periodStart)} – ${DateService.formatDateForDisplay(closure.periodEnd)}`;
    throw new AppError('PERIOD_CLOSED',
      `Der Abrechnungszeitraum ${range} ist abgeschlossen. ` +
      'Änderungen sind erst nach Wiedereröffnung durch einen Administrator möglich.'
    );
  }
};

module.exports = { overlaps, findClosureCovering, assertDateOpen };
