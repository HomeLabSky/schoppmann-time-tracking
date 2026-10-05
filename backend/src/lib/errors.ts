/**
 * Fachliche Fehler mit maschinenlesbarem Code.
 *
 * Services werfen `AppError('CODE', 'Nachricht')`; der zentrale Error-Handler (middleware/errorHandler.ts)
 * macht daraus `{ success:false, error, code }` mit dem HTTP-Status aus ERROR_STATUS. Unbekannte Fehler
 * werden nie mit ihrer internen Meldung ausgeliefert, sondern als 500 INTERNAL_ERROR (mit Request-ID).
 *
 * Die Codes sind Teil des öffentlichen API-Vertrags (Web und App): nicht stillschweigend umbenennen.
 * 401 heißt ausschließlich "nicht (mehr) angemeldet" – fachliche Ablehnungen sind nie 401, sonst meldet
 * der Client den Benutzer ab.
 */

export const ERROR_STATUS = {
  // Anfrage
  VALIDATION_ERROR: 400,
  INVALID_JSON: 400,
  INVALID_CONTENT_TYPE: 400,
  CSRF_HEADER_MISSING: 403,
  ROUTE_NOT_FOUND: 404,
  ENDPOINT_NOT_FOUND: 404,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_ERROR: 500,

  // Anmeldung / Sitzung
  MISSING_TOKEN: 401,
  TOKEN_EXPIRED: 401,
  INVALID_TOKEN: 401,
  SESSION_ENDED: 401,
  MISSING_REFRESH_TOKEN: 401,
  INVALID_REFRESH_TOKEN: 401,
  REFRESH_TOKEN_REUSED: 401,
  SESSION_NOT_FOUND: 404,
  CANNOT_REVOKE_CURRENT_SESSION: 400,
  REFRESH_IN_PROGRESS: 409,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 429,
  USER_INACTIVE: 403,
  INSUFFICIENT_PERMISSIONS: 403,
  REGISTRATION_DISABLED: 403,

  // Benutzer
  USER_NOT_FOUND: 404,
  EMAIL_EXISTS: 409,
  INVALID_CURRENT_PASSWORD: 400,
  INVALID_ROLE: 400,
  CANNOT_DEACTIVATE_SELF: 400,
  CANNOT_DELETE_SELF: 400,
  USER_HAS_DEPENDENCIES: 400,
  SETTINGS_ADMIN_ONLY: 403,

  // Minijob-Grenzen
  SETTING_NOT_FOUND: 404,
  NO_CURRENT_SETTING: 404,
  OVERLAPPING_PERIODS: 409,
  CANNOT_DELETE_ACTIVE: 400,

  // Zeiterfassung
  ENTRY_NOT_FOUND: 404,
  ENTRY_OVERLAP: 409,
  CLIENT_ID_CONFLICT: 409,

  // Monatsabschluss
  PERIOD_CLOSED: 409,
  PERIOD_NOT_ENDED: 409,
  PERIOD_ALREADY_CLOSED: 409,
  PERIOD_NOT_CLOSED: 409,
  PERIOD_PREVIOUS_OPEN: 409,
  PERIOD_LATER_CLOSED: 409,
  PERIOD_OVERLAP: 409,
  MINIJOB_LIMIT_MISSING: 409,
  REASON_REQUIRED: 400
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface AppErrorOptions {
  status?: number;
  /** Bei VALIDATION_ERROR: Meldung je Feld */
  fields?: Record<string, string>;
  details?: string[];
  /** Zusätzliche Felder der Fehlerantwort (z. B. retryAfter) */
  extra?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;
  readonly details: string[] | undefined;
  readonly extra: Record<string, unknown> | undefined;

  /**
   * @param code Vertrags-Fehlercode
   * @param message Meldung für den Benutzer (deutsch)
   */
  constructor(code: ErrorCode, message: string, { status, fields, details, extra, cause }: AppErrorOptions = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = status ?? ERROR_STATUS[code] ?? 500;
    this.fields = fields;
    this.details = details;
    this.extra = extra;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
