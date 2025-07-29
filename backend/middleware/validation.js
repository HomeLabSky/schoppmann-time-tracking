const { body, validationResult } = require('express-validator');
const config = require('../config');

// ✅ Registrierung Validierung
const validateRegistration = [
  body('email')
    .isEmail()
    .withMessage('Bitte eine gültige Email-Adresse eingeben')
    .normalizeEmail()
    .custom(async (email) => {
      // Optional: Email-Domain Whitelist für Production
      if (config.nodeEnv === 'production') {
        const allowedDomains = ['schoppmann.de', 'example.com']; // Anpassen nach Bedarf
        const domain = email.split('@')[1];
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
    .withMessage('Abrechnungsende muss zwischen 1 und 31 liegen')
    .custom((endDay, { req }) => {
      const startDay = req.body.abrechnungStart;
      if (startDay && endDay && startDay >= endDay) {
        throw new Error('Abrechnungsende muss nach dem Abrechnungsstart liegen');
      }
      return true;
    }),
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
    .withMessage('Gültigkeit-Von muss ein gültiges Datum sein (YYYY-MM-DD)')
    .custom((date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Nur Datum vergleichen
      if (date < today) {
        throw new Error('Startdatum darf nicht in der Vergangenheit liegen');
      }
      return true;
    }),
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

// ✅ Custom validation helpers
const customValidations = {
  // Prüft ob Datum nicht in der Vergangenheit liegt
  isNotPastDate: (value) => {
    const today = new Date().toISOString().split('T')[0];
    if (value < today) {
      throw new Error('Datum darf nicht in der Vergangenheit liegen');
    }
    return true;
  },
  
  // Prüft ob End-Datum nach Start-Datum liegt
  isAfterStartDate: (endDate, { req }) => {
    if (req.body.validFrom && endDate <= req.body.validFrom) {
      throw new Error('Enddatum muss nach dem Startdatum liegen');
    }
    return true;
  },
  
  // Email-Domain Validierung
  isDomainAllowed: (email, allowedDomains = []) => {
    if (allowedDomains.length === 0) return true;
    const domain = email.split('@')[1];
    if (!allowedDomains.includes(domain)) {
      throw new Error(`Email-Domain ${domain} ist nicht erlaubt`);
    }
    return true;
  }
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
  handleValidationErrors,
  customValidations,
  sanitizeInput
};