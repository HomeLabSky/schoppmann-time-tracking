/**
 * Zentrale Fehlerbehandlung: jede Fehlerantwort hat die Form `{ success:false, error, code }`.
 *
 * - AppError (fachlich, erwartet): Status und Code aus dem Fehler, Meldung für den Benutzer.
 * - Ungültiges JSON / zu großer Body: 400 bzw. 413; verletzte Prüfregel der Datenbank (CHECK): 400.
 * - Alles andere ist ein Programm- oder Infrastrukturfehler: 500 INTERNAL_ERROR ohne interne Details,
 *   aber mit Request-ID; der vollständige Fehler steht im Log.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, isAppError } from '../lib/errors';
import logger from '../lib/logger';

export const notFound = (code: 'ROUTE_NOT_FOUND' | 'ENDPOINT_NOT_FOUND') => (_req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(code, code === 'ENDPOINT_NOT_FOUND' ? 'API-Endpoint nicht gefunden' : 'Route nicht gefunden'));
};

interface ErrorLike {
  type?: string;
  code?: string;
  message?: string;
}

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const log = req.log || logger;
  const raw = (error && typeof error === 'object' ? error : {}) as ErrorLike;

  let appError: AppError | null = isAppError(error) ? error : null;
  if (!appError) {
    if (raw.type === 'entity.parse.failed') {
      appError = new AppError('INVALID_JSON', 'Ungültiger Request-Body');
    } else if (raw.type === 'entity.too.large') {
      appError = new AppError('VALIDATION_ERROR', 'Anfrage ist zu groß', { status: 413 });
    } else if (raw.code === 'SQLITE_CONSTRAINT_CHECK') {
      // Prüfregel der Datenbank (zweite Verteidigungslinie hinter den zod-Schemas) – deutet auf eine Lücke
      // in der Eingabeprüfung hin, daher zusätzlich als Warnung im Log
      log.warn({ err: error }, 'Prüfregel der Datenbank verletzt');
      appError = new AppError('VALIDATION_ERROR', 'Ungültige Daten');
    } else {
      log.error({ err: error }, 'Unerwarteter Fehler');
    }
  } else if (appError.status >= 500) {
    log.error({ err: error, code: appError.code }, 'Serverfehler');
  }

  if (res.headersSent) return;

  if (!appError) {
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      code: 'INTERNAL_ERROR',
      requestId: req.id
    });
    return;
  }

  if (appError.extra?.retryAfter) {
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

