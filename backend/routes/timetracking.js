const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const TimeEntryService = require('../services/timeEntryService');
const config = require('../config');

const router = express.Router();

// ✅ Validation Helper
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg);
    return res.status(400).json({
      success: false,
      error: 'Eingabevalidierung fehlgeschlagen',
      code: 'VALIDATION_ERROR',
      details: errorMessages,
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// ✅ Time Entry Validierung
const validateTimeEntry = [
  body('date')
    .isISO8601({ strict: true })
    .withMessage('Datum muss im Format YYYY-MM-DD sein')
    .toDate(),
  body('startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Startzeit muss im Format HH:mm sein'),
  body('endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Endzeit muss im Format HH:mm sein'),
  body('breakMinutes')
    .optional()
    .isInt({ min: 0, max: 480 })
    .withMessage('Pausendauer muss zwischen 0 und 480 Minuten liegen'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Beschreibung darf maximal 500 Zeichen haben')
];

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
      
      const result = await TimeEntryService.getMonthlyTimeRecords(
        req.user.userId, 
        year, 
        monthNumber
      );

      console.log(`📊 ${req.user.email} hat Zeiteinträge für ${month} abgerufen (${result.records.length} Einträge)`);

      res.json({
        success: true,
        message: 'Zeiteinträge erfolgreich geladen',
        data: result
      });
    } catch (error) {
      console.error('Fehler beim Laden der Zeiteinträge:', error);
      
      if (error.message.includes('USER_NOT_FOUND')) {
        return res.status(404).json({
          success: false,
          error: 'Benutzer nicht gefunden',
          code: 'USER_NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Zeiteinträge konnten nicht geladen werden',
        code: 'TIMERECORDS_LOAD_ERROR',
        details: config.nodeEnv === 'development' ? error.message : undefined
      });
    }
  }
);

// ✅ ABRECHNUNGSPERIODEN ABRUFEN (für Dropdown)
router.get('/periods', 
  authenticateToken,
  async (req, res) => {
    try {
      const periods = await TimeEntryService.generateBillingPeriods(req.user.userId, 12, 3);

      res.json({
        success: true,
        message: 'Abrechnungsperioden erfolgreich geladen',
        data: {
          periods,
          currentPeriod: periods.find(p => p.isCurrent)
        }
      });
    } catch (error) {
      console.error('Fehler beim Laden der Abrechnungsperioden:', error);
      res.status(500).json({
        success: false,
        error: 'Abrechnungsperioden konnten nicht geladen werden',
        code: 'PERIODS_LOAD_ERROR'
      });
    }
  }
);

// ✅ EINZELNEN ZEITEINTRAG ABRUFEN
router.get('/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).withMessage('Ungültige Eintrag-ID'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const entryId = parseInt(req.params.id);
      const entry = await TimeEntryService.getTimeEntry(entryId, req.user.userId);

      res.json({
        success: true,
        message: 'Zeiteintrag erfolgreich geladen',
        data: { entry }
      });
    } catch (error) {
      console.error('Fehler beim Laden des Zeiteintrags:', error);
      
      if (error.message.includes('ENTRY_NOT_FOUND')) {
        return res.status(404).json({
          success: false,
          error: 'Zeiteintrag nicht gefunden',
          code: 'ENTRY_NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Zeiteintrag konnte nicht geladen werden',
        code: 'ENTRY_LOAD_ERROR'
      });
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

      const newEntry = await TimeEntryService.createTimeEntry(entryData);

      console.log(`➕ ${req.user.email} hat Zeiteintrag erstellt: ${entryData.date} (${entryData.startTime}-${entryData.endTime})`);

      res.status(201).json({
        success: true,
        message: 'Zeiteintrag erfolgreich erstellt',
        data: { entry: newEntry }
      });
    } catch (error) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error);
      
      if (error.message.includes('VALIDATION_ERROR')) {
        return res.status(400).json({
          success: false,
          error: 'Eingabevalidierung fehlgeschlagen',
          code: 'VALIDATION_ERROR',
          details: error.message.split(':')[1]
        });
      }

      if (error.message.includes('ENTRY_EXISTS')) {
        return res.status(409).json({
          success: false,
          error: 'Für dieses Datum existiert bereits ein Zeiteintrag',
          code: 'ENTRY_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Zeiteintrag konnte nicht erstellt werden',
        code: 'ENTRY_CREATE_ERROR',
        details: config.nodeEnv === 'development' ? error.message : undefined
      });
    }
  }
);

// ✅ ZEITEINTRAG AKTUALISIEREN
router.put('/:id',
  authenticateToken,
  [
    param('id').isInt({ min: 1 }).withMessage('Ungültige Eintrag-ID'),
    ...validateTimeEntry.filter(v => v.builder.fields[0] !== 'date'), // Datum kann bei Update nicht geändert werden
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const entryId = parseInt(req.params.id);
      const updateData = { ...req.body };

      // Datum-Update verhindern
      delete updateData.date;
      delete updateData.userId;

      const updatedEntry = await TimeEntryService.updateTimeEntry(
        entryId, 
        updateData, 
        req.user.userId
      );

      console.log(`✏️ ${req.user.email} hat Zeiteintrag ${entryId} aktualisiert`);

      res.json({
        success: true,
        message: 'Zeiteintrag erfolgreich aktualisiert',
        data: { entry: updatedEntry }
      });
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Zeiteintrags:', error);
      
      if (error.message.includes('ENTRY_NOT_FOUND')) {
        return res.status(404).json({
          success: false,
          error: 'Zeiteintrag nicht gefunden',
          code: 'ENTRY_NOT_FOUND'
        });
      }

      if (error.message.includes('VALIDATION_ERROR')) {
        return res.status(400).json({
          success: false,
          error: 'Eingabevalidierung fehlgeschlagen',
          code: 'VALIDATION_ERROR',
          details: error.message.split(':')[1]
        });
      }

      res.status(500).json({
        success: false,
        error: 'Zeiteintrag konnte nicht aktualisiert werden',
        code: 'ENTRY_UPDATE_ERROR'
      });
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
      const entryId = parseInt(req.params.id);
      await TimeEntryService.deleteTimeEntry(entryId, req.user.userId);

      console.log(`🗑️ ${req.user.email} hat Zeiteintrag ${entryId} gelöscht`);

      res.json({
        success: true,
        message: 'Zeiteintrag erfolgreich gelöscht'
      });
    } catch (error) {
      console.error('Fehler beim Löschen des Zeiteintrags:', error);
      
      if (error.message.includes('ENTRY_NOT_FOUND')) {
        return res.status(404).json({
          success: false,
          error: 'Zeiteintrag nicht gefunden',
          code: 'ENTRY_NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Zeiteintrag konnte nicht gelöscht werden',
        code: 'ENTRY_DELETE_ERROR'
      });
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

      res.json({
        success: true,
        message: 'Statistiken erfolgreich geladen',
        data: stats
      });
    } catch (error) {
      console.error('Fehler beim Laden der Statistiken:', error);
      res.status(500).json({
        success: false,
        error: 'Statistiken konnten nicht geladen werden',
        code: 'STATS_LOAD_ERROR'
      });
    }
  }
);

// ✅ Development: Testdaten erstellen (nur in Development)
if (config.nodeEnv === 'development') {
  router.post('/dev/create-test-data',
    authenticateToken,
    async (req, res) => {
      try {
        const testEntries = [];
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        // 10 Testeinträge für aktuellen Monat erstellen
        for (let i = 1; i <= 10; i++) {
          const date = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
          
          const entryData = {
            userId: req.user.userId,
            date: date,
            startTime: '08:00',
            endTime: '16:30',
            breakMinutes: 30,
            description: `Testarbeit Tag ${i}`
          };

          try {
            const entry = await TimeEntryService.createTimeEntry(entryData);
            testEntries.push(entry);
          } catch (error) {
            if (!error.message.includes('ENTRY_EXISTS')) {
              console.warn(`Testdaten-Eintrag für ${date} übersprungen:`, error.message);
            }
          }
        }

        res.json({
          success: true,
          message: `${testEntries.length} Testeinträge erstellt`,
          data: { entries: testEntries }
        });
      } catch (error) {
        console.error('Fehler beim Erstellen der Testdaten:', error);
        res.status(500).json({
          success: false,
          error: 'Testdaten konnten nicht erstellt werden',
          code: 'TEST_DATA_CREATE_ERROR'
        });
      }
    }
  );
}

module.exports = router;