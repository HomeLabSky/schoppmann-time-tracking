/**
 * Zeiterfassungs-Routen (/api/timetracking).
 *
 * Dünne Controller-Schicht über TimeEntryService. Validierung über die
 * zentralen Validatoren aus middleware/validation.js, Fehler-Mapping über
 * den gemeinsamen Service-Fehler-Helfer.
 */
const express = require('express');
const { query, param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { validateTimeEntry, handleValidationErrors } = require('../middleware/validation');
const TimeEntryService = require('../services/timeEntryService');
const { sendServiceError } = require('../utils/serviceErrors');
const config = require('../config');

const router = express.Router();

// Auslöser für das Änderungsprotokoll
const actorOf = (req) => ({ id: req.user.userId, email: req.user.email });

// ✅ ZEITEINTRÄGE FÜR MONAT ABRUFEN
router.get('/',
  authenticateToken,
  [
    query('month')
      .matches(/^\d{4}-\d{2}$/)
      .withMessage('Monat muss im Format YYYY-MM sein'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { month } = req.query;
      const [year, monthNumber] = month.split('-').map(Number);

      const result = await TimeEntryService.getMonthlyTimeRecords(req.user.userId, year, monthNumber);

      console.log(`📊 ${req.user.email} hat Zeiteinträge für ${month} abgerufen (${result.records.length} Einträge)`);
      res.json({ success: true, message: 'Zeiteinträge erfolgreich geladen', data: result });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'TIMERECORDS_LOAD_ERROR', error: 'Zeiteinträge konnten nicht geladen werden' });
    }
  }
);

// ✅ ABRECHNUNGSPERIODEN ABRUFEN (für Dropdown)
router.get('/periods', authenticateToken, async (req, res) => {
  try {
    const periods = await TimeEntryService.generateBillingPeriods(req.user.userId, 12, 3);

    res.json({
      success: true,
      message: 'Abrechnungsperioden erfolgreich geladen',
      data: { periods, currentPeriod: periods.find(p => p.isCurrent) }
    });
  } catch (error) {
    sendServiceError(res, error, { status: 500, code: 'PERIODS_LOAD_ERROR', error: 'Abrechnungsperioden konnten nicht geladen werden' });
  }
});

// ✅ EINZELNEN ZEITEINTRAG ABRUFEN
router.get('/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).withMessage('Ungültige Eintrag-ID'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const entry = await TimeEntryService.getTimeEntry(parseInt(req.params.id), req.user.userId);
      res.json({ success: true, message: 'Zeiteintrag erfolgreich geladen', data: { entry } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'ENTRY_LOAD_ERROR', error: 'Zeiteintrag konnte nicht geladen werden' });
    }
  }
);

// ✅ NEUEN ZEITEINTRAG ERSTELLEN
router.post('/',
  authenticateToken,
  validateTimeEntry,
  handleValidationErrors,
  async (req, res) => {
    try {
      const entryData = {
        ...req.body,
        userId: req.user.userId,
        date: req.body.date.toISOString().split('T')[0] // Datum normalisieren
      };

      const newEntry = await TimeEntryService.createTimeEntry(entryData, actorOf(req));

      console.log(`➕ ${req.user.email} hat Zeiteintrag erstellt: ${entryData.date} (${entryData.startTime}-${entryData.endTime})`);
      res.status(201).json({ success: true, message: 'Zeiteintrag erfolgreich erstellt', data: { entry: newEntry } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'ENTRY_CREATE_ERROR', error: 'Zeiteintrag konnte nicht erstellt werden' });
    }
  }
);

// ✅ ZEITEINTRAG AKTUALISIEREN (Datum ist nicht änderbar)
router.put('/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).withMessage('Ungültige Eintrag-ID'),
    ...validateTimeEntry.filter(v => v.builder.fields[0] !== 'date'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const updateData = { ...req.body };
      delete updateData.date;
      delete updateData.userId;

      const updatedEntry = await TimeEntryService.updateTimeEntry(parseInt(req.params.id), updateData, req.user.userId, actorOf(req));

      console.log(`✏️ ${req.user.email} hat Zeiteintrag ${req.params.id} aktualisiert`);
      res.json({ success: true, message: 'Zeiteintrag erfolgreich aktualisiert', data: { entry: updatedEntry } });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'ENTRY_UPDATE_ERROR', error: 'Zeiteintrag konnte nicht aktualisiert werden' });
    }
  }
);

// ✅ ZEITEINTRAG LÖSCHEN
router.delete('/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).withMessage('Ungültige Eintrag-ID'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      await TimeEntryService.deleteTimeEntry(parseInt(req.params.id), req.user.userId, actorOf(req));

      console.log(`🗑️ ${req.user.email} hat Zeiteintrag ${req.params.id} gelöscht`);
      res.json({ success: true, message: 'Zeiteintrag erfolgreich gelöscht' });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'ENTRY_DELETE_ERROR', error: 'Zeiteintrag konnte nicht gelöscht werden' });
    }
  }
);

// ✅ STATISTIKEN FÜR MEHRERE MONATE
router.get('/stats/multi-month',
  authenticateToken,
  [
    query('months').optional().isInt({ min: 1, max: 24 }).withMessage('Monate muss zwischen 1 und 24 liegen'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const months = parseInt(req.query.months) || 12;
      const stats = await TimeEntryService.getMultiMonthStats(req.user.userId, months);

      console.log(`📊 ${req.user.email} hat Multi-Monats-Statistiken abgerufen (${months} Monate)`);
      res.json({ success: true, message: 'Statistiken erfolgreich geladen', data: stats });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'STATS_LOAD_ERROR', error: 'Statistiken konnten nicht geladen werden' });
    }
  }
);

// ✅ Development: Testdaten erstellen (nur in Development)
if (config.nodeEnv === 'development') {
  router.post('/dev/create-test-data', authenticateToken, async (req, res) => {
    try {
      const testEntries = [];
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      for (let i = 1; i <= 10; i++) {
        const date = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        try {
          const entry = await TimeEntryService.createTimeEntry({
            userId: req.user.userId,
            date,
            startTime: '08:00',
            endTime: '16:30',
            breakMinutes: 30,
            description: `Testarbeit Tag ${i}`
          });
          testEntries.push(entry);
        } catch (error) {
          if (!error.message.includes('ENTRY_EXISTS')) {
            console.warn(`Testdaten-Eintrag für ${date} übersprungen:`, error.message);
          }
        }
      }

      res.json({ success: true, message: `${testEntries.length} Testeinträge erstellt`, data: { entries: testEntries } });
    } catch (error) {
      console.error('Fehler beim Erstellen der Testdaten:', error);
      res.status(500).json({ success: false, error: 'Testdaten konnten nicht erstellt werden', code: 'TEST_DATA_CREATE_ERROR' });
    }
  });
}

module.exports = router;
