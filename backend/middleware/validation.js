const { body, validationResult } = require('express-validator');
const config = require('../config');

// ✅ Registrierung Validierung
const validateRegistration = [
  body('email')
    .isEmail()
    .withMessage('Bitte eine gültige Email-Adresse eingeben')
    .normalizeEmail()
    .custom(async (email) => {
      // Optionale Domain-Einschränkung über ALLOWED_EMAIL_DOMAINS (leer = alle erlaubt)
      const allowedDomains = config.allowedEmailDomains;
      if (allowedDomains.length > 0) {
        const domain = String(email).split('@')[1];
        if (!allowedDomains.includes(domain)) {
          throw new Error('Email-Domain nicht erlaubt');
        }
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Passwort muss mindestens 8 Zeichen haben')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Passwort muss Groß-, Kleinbuchstaben und mindestens eine Zahl enthalten'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name muss zwischen 2 und 50 Zeichen haben')
    .matches(/^[a-zA-ZäöüÄÖÜß\s\-'\.]+$/)
    .withMessage('Name darf nur Buchstaben, Leerzeichen, Bindestriche und Apostrophe enthalten')
];

// ✅ Login Validierung
const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Bitte eine gültige Email-Adresse eingeben')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Passwort ist erforderlich')
    .isLength({ min: 1 })
    .withMessage('Passwort darf nicht leer sein')
];

// ✅ User-Update Validierung
const validateUserUpdate = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Bitte eine gültige Email-Adresse eingeben')
    .normalizeEmail(),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name muss zwischen 2 und 50 Zeichen haben')
    .matches(/^[a-zA-ZäöüÄÖÜß\s\-'\.]+$/)
    .withMessage('Name darf nur Buchstaben, Leerzeichen, Bindestriche und Apostrophe enthalten'),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Passwort muss mindestens 8 Zeichen haben')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Passwort muss Groß-, Kleinbuchstaben und mindestens eine Zahl enthalten'),
  body('role')
    .optional()
    .isIn(['admin', 'mitarbeiter'])
    .withMessage('Rolle muss admin oder mitarbeiter sein'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive muss ein Boolean-Wert sein')
];

// ✅ User-Settings Validierung
const validateUserSettings = [
  body('stundenlohn')
    .optional()
    .isFloat({ min: 0, max: 999 })
    .withMessage('Stundenlohn muss zwischen 0 und 999 Euro liegen')
    .custom((value) => {
      // Maximal 2 Dezimalstellen
      if (value && !Number.isInteger(value * 100)) {
        throw new Error('Stundenlohn darf maximal 2 Dezimalstellen haben');
      }
      return true;
    }),
  body('abrechnungStart')
    .optional()
    .isInt({ min: 1, max: 31 })
    .withMessage('Abrechnungsstart muss zwischen 1 und 31 liegen'),
  body('abrechnungEnde')
    .optional()
    .isInt({ min: 1, max: 31 })
    .withMessage('Abrechnungsende muss zwischen 1 und 31 liegen'),
  body('lohnzettelEmail')
    .optional()
    .isEmail()
    .withMessage('Bitte eine gültige Email-Adresse für Lohnzettel eingeben')
    .normalizeEmail()
];

// ✅ Minijob-Setting Validierung
const validateMinijobSetting = [
  body('monthlyLimit')
    .isFloat({ min: 0, max: 999999.99 })
    .withMessage('Monatliches Limit muss zwischen 0 und 999.999,99€ liegen')
    .custom((value) => {
      // Maximal 2 Dezimalstellen
      if (!Number.isInteger(value * 100)) {
        throw new Error('Monatliches Limit darf maximal 2 Dezimalstellen haben');
      }
      return true;
    }),
  body('description')
    .trim()
    .isLength({ min: 3, max: 500 })
    .withMessage('Beschreibung muss zwischen 3 und 500 Zeichen haben')
    .matches(/^[a-zA-ZäöüÄÖÜß0-9\s\-_.,!?()]+$/)
    .withMessage('Beschreibung enthält unerlaubte Zeichen'),
  body('validFrom')
    .isISO8601({ strict: true })
    .toDate()
    // Rückwirkend erlaubt: Abgeschlossene Perioden haben ihre Grenze eingefroren, betroffen sind nur
    // offene Perioden – sonst ließen sich Perioden ohne hinterlegte Grenze nie abschließen.
    .withMessage('Gültigkeit-Von muss ein gültiges Datum sein (YYYY-MM-DD)'),
  body('validUntil')
    .optional({ nullable: true })
    .isISO8601({ strict: true })
    .toDate()
    .withMessage('Gültigkeit-Bis muss ein gültiges Datum sein oder leer bleiben')
    .custom((endDate, { req }) => {
      if (endDate && req.body.validFrom) {
        const startDate = new Date(req.body.validFrom);
        if (endDate <= startDate) {
          throw new Error('Enddatum muss nach dem Startdatum liegen');
        }
      }
      return true;
    })
];

// ✅ Zeiteintrag-Validierung
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

// ✅ Validation Error Handler mit verbessertem Logging
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg);
    const fieldErrors = errors.array().reduce((acc, err) => {
      acc[err.path] = err.msg;
      return acc;
    }, {});

    // Development Logging
    if (config.nodeEnv === 'development') {
      console.log('❌ Validation errors:', errorMessages);
      console.log('🔍 Fields with errors:', Object.keys(fieldErrors));
    }

    return res.status(400).json({
      success: false,
      error: 'Eingabefehler',
      code: 'VALIDATION_ERROR',
      details: errorMessages,
      fields: fieldErrors,
      timestamp: new Date().toISOString()
    });
  }

  // Development Success Logging  
  if (config.nodeEnv === 'development') {
    console.log(`✅ Validation passed: ${req.method} ${req.path}`);
  }

  next();
};

// ✅ Sanitization Middleware (für zusätzliche Sicherheit)
const sanitizeInput = (req, res, next) => {
  // Trim all string inputs
  for (const key in req.body) {
    if (typeof req.body[key] === 'string') {
      req.body[key] = req.body[key].trim();
    }
  }
  next();
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateUserUpdate,
  validateUserSettings,
  validateMinijobSetting,
  validateTimeEntry,
  handleValidationErrors,
  sanitizeInput
};