/**
 * Admin-Zeitnachweise (/api/admin/timesheets) – nur für Admins.
 *
 * Admins sehen die Zeiten aller Mitarbeiter und schließen Abrechnungsperioden ab
 * bzw. öffnen sie (mit Begründung) wieder. Dünne Controller-Schicht über
 * TimeEntryService und PeriodService; jede Änderung landet im Änderungsprotokoll.
 */
const express = require('express');
const { query, param, body } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const TimeEntryService = require('../services/timeEntryService');
const PeriodService = require('../services/periodService');
const { sendServiceError } = require('../utils/serviceErrors');

const router = express.Router();

const actorOf = (req) => ({ id: req.user.userId, email: req.user.email });
const parseMonth = (month) => month.split('-').map(Number);

const userIdParam = param('userId').isInt({ min: 1 }).withMessage('Ungültige Benutzer-ID');
const monthRule = (location) =>
  location('month').matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('Monat muss im Format YYYY-MM sein');

// ✅ ABRECHNUNGSPERIODEN EINES MITARBEITERS (mit Abschluss-Kennzeichen)
router.get('/:userId/periods',
  requireAdmin,
  [userIdParam, handleValidationErrors],
  async (req, res) => {
    try {
      const periods = await TimeEntryService.generateBillingPeriods(parseInt(req.params.userId), 12, 1);
      res.json({
        success: true,
        message: 'Abrechnungsperioden erfolgreich geladen',
        data: { periods, currentPeriod: periods.find((p) => p.isCurrent) }
      });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'PERIODS_LOAD_ERROR', error: 'Abrechnungsperioden konnten nicht geladen werden' });
    }
  }
);

// ✅ ZEITNACHWEIS EINES MITARBEITERS FÜR EINE PERIODE
router.get('/:userId',
  requireAdmin,
  [userIdParam, monthRule(query), handleValidationErrors],
  async (req, res) => {
    try {
      const [year, month] = parseMonth(req.query.month);
      const result = await TimeEntryService.getMonthlyTimeRecords(parseInt(req.params.userId), year, month);
      res.json({ success: true, message: 'Zeitnachweis erfolgreich geladen', data: result });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'TIMESHEET_LOAD_ERROR', error: 'Zeitnachweis konnte nicht geladen werden' });
    }
  }
);

// ✅ PERIODE ABSCHLIESSEN
router.post('/:userId/close',
  requireAdmin,
  [userIdParam, monthRule(body), handleValidationErrors],
  async (req, res) => {
    try {
      const [year, month] = parseMonth(req.body.month);
      const closure = await PeriodService.closePeriod(parseInt(req.params.userId), year, month, actorOf(req));
      console.log(`🔒 Admin ${req.user.email} hat Periode ${closure.periodStart} – ${closure.periodEnd} (User ${req.params.userId}) abgeschlossen`);
      res.status(201).json({ success: true, message: 'Periode erfolgreich abgeschlossen', data: { closure } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'PERIOD_CLOSE_ERROR', error: 'Periode konnte nicht abgeschlossen werden' });
    }
  }
);

// ✅ PERIODE WIEDER ÖFFNEN (Begründung Pflicht)
router.post('/:userId/reopen',
  requireAdmin,
  [
    userIdParam,
    monthRule(body),
    body('reason').isString().trim().isLength({ min: 5, max: 500 })
      .withMessage('Bitte eine Begründung angeben (5 bis 500 Zeichen)'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const [year, month] = parseMonth(req.body.month);
      const result = await PeriodService.reopenPeriod(parseInt(req.params.userId), year, month, req.body.reason, actorOf(req));
      console.log(`🔓 Admin ${req.user.email} hat Periode ${result.periodStart} – ${result.periodEnd} (User ${req.params.userId}) wieder geöffnet`);
      res.json({ success: true, message: 'Periode wieder geöffnet', data: result });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'PERIOD_REOPEN_ERROR', error: 'Periode konnte nicht geöffnet werden' });
    }
  }
);

module.exports = router;
