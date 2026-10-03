/**
 * Zentrale Fehlerbehandlung: jede Fehlerantwort hat die Form `{ success:false, error, code }`.
 *
 * - AppError (fachlich, erwartet): Status und Code aus dem Fehler, Meldung für den Benutzer.
 * - Ungültiges JSON / zu großer Body: 400 bzw. 413; Model-Validierung (Sequelize): 400.
 * - Alles andere ist ein Programm- oder Infrastrukturfehler: 500 INTERNAL_ERROR ohne interne Details,
 *   aber mit Request-ID; der vollständige Fehler steht im Log.
 */
const { AppError, isAppError } = require('../lib/errors');
const logger = require('../lib/logger');

const notFound = (code) => (req, res, next) => {
  next(new AppError(code, code === 'ENDPOINT_NOT_FOUND' ? 'API-Endpoint nicht gefunden' : 'Route nicht gefunden'));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (error, req, res, next) => {
  const log = req.log || logger;

  let appError = error;
  if (!isAppError(error)) {
    if (error && error.type === 'entity.parse.failed') {
      appError = new AppError('INVALID_JSON', 'Ungültiger Request-Body');
    } else if (error && error.type === 'entity.too.large') {
      appError = new AppError('VALIDATION_ERROR', 'Anfrage ist zu groß', { status: 413 });
    } else if (error && error.name === 'SequelizeValidationError') {
      // Model-Validierung (zweite Verteidigungslinie hinter den zod-Schemas)
      const details = error.errors.map((e) => e.message);
      appError = new AppError('VALIDATION_ERROR', details.join(', '), { details });
    } else {
      log.error({ err: error }, 'Unerwarteter Fehler');
      appError = null;
    }
  } else if (appError.status >= 500) {
    log.error({ err: error, code: appError.code }, 'Serverfehler');
  }

  if (res.headersSent) return;

  if (!appError) {
    return res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      code: 'INTERNAL_ERROR',
      requestId: req.id
    });
  }

  if (appError.extra && appError.extra.retryAfter) {
    res.set('Retry-After', String(appError.extra.retryAfter));
  }

  res.status(appError.status).json({
    success: false,
    error: appError.message,
    code: appError.code,
    ...(appError.details ? { details: appError.details } : {}),
    ...(appError.fields ? { fields: appError.fields } : {}),
    ...(appError.extra || {})
  });
};

module.exports = { errorHandler, notFound };
