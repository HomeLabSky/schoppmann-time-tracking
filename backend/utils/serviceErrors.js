/**
 * Service-Fehler → HTTP-Antwort (vertragstreu).
 *
 * Services werfen Fehler im Format `CODE:Nachricht` (teils mehrfach
 * verschachtelt, z. B. `SETTING_CREATE_ERROR:OVERLAPPING_PERIODS:...`).
 * Dieser Helfer scannt die Segmente, findet den ersten BEKANNTEN Fachcode
 * und bildet ihn auf den exakten HTTP-Status und Vertrags-Fehlercode ab,
 * den das Frontend erwartet ({ success:false, error, code }).
 *
 * Unbekannte Fehler werden auf einen Endpoint-spezifischen Fallback
 * abgebildet (Default 500) und geloggt.
 */

// Interner Servicecode → [HTTP-Status, nach außen gemeldeter Fehlercode].
const ERROR_MAP = {
  // Auth / User
  USER_ALREADY_EXISTS: [409, 'EMAIL_EXISTS'],
  EMAIL_EXISTS: [409, 'EMAIL_EXISTS'],
  INVALID_CREDENTIALS: [401, 'INVALID_CREDENTIALS'],
  USER_INACTIVE: [403, 'USER_INACTIVE'],
  USER_NOT_FOUND: [404, 'USER_NOT_FOUND'],
  INVALID_CURRENT_PASSWORD: [401, 'INVALID_CURRENT_PASSWORD'],
  INVALID_ROLE: [400, 'INVALID_ROLE'],
  CANNOT_DEACTIVATE_SELF: [400, 'CANNOT_DEACTIVATE_SELF'],
  CANNOT_DELETE_SELF: [400, 'CANNOT_DELETE_SELF'],
  USER_HAS_DEPENDENCIES: [400, 'USER_HAS_DEPENDENCIES'],

  // Validierung (Settings/User)
  VALIDATION_ERROR: [400, 'VALIDATION_ERROR'],
  INVALID_HOURLY_RATE: [400, 'VALIDATION_ERROR'],
  INVALID_BILLING_START: [400, 'VALIDATION_ERROR'],
  INVALID_BILLING_END: [400, 'VALIDATION_ERROR'],

  // Minijob
  SETTING_NOT_FOUND: [404, 'SETTING_NOT_FOUND'],
  OVERLAPPING_PERIODS: [409, 'OVERLAPPING_PERIODS'],
  CANNOT_DELETE_ACTIVE: [400, 'CANNOT_DELETE_ACTIVE'],

  // Zeiterfassung
  ENTRY_NOT_FOUND: [404, 'ENTRY_NOT_FOUND'],
  ENTRY_EXISTS: [409, 'ENTRY_EXISTS'],

  // Monatsabschluss
  PERIOD_CLOSED: [409, 'PERIOD_CLOSED'],
  PERIOD_NOT_ENDED: [409, 'PERIOD_NOT_ENDED'],
  PERIOD_ALREADY_CLOSED: [409, 'PERIOD_ALREADY_CLOSED'],
  PERIOD_NOT_CLOSED: [409, 'PERIOD_NOT_CLOSED'],
  PERIOD_PREVIOUS_OPEN: [409, 'PERIOD_PREVIOUS_OPEN'],
  PERIOD_LATER_CLOSED: [409, 'PERIOD_LATER_CLOSED'],
  PERIOD_OVERLAP: [409, 'PERIOD_OVERLAP'],
  REASON_REQUIRED: [400, 'REASON_REQUIRED']
};

/**
 * Findet den ersten bekannten Fachcode in einer (ggf. verschachtelten)
 * Service-Fehlermeldung.
 * @param {string} message z. B. "SETTING_CREATE_ERROR:OVERLAPPING_PERIODS:Text"
 * @returns {{ code: string, message: string }|null}
 */
const extractKnownError = (message) => {
  const tokens = String(message || '').split(':');
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i].trim();
    if (ERROR_MAP[code]) {
      return { code, message: tokens.slice(i + 1).join(':').trim() };
    }
  }
  return null;
};

/**
 * Schickt eine vertragstreue Fehlerantwort für einen Service-Fehler.
 * @param {import('express').Response} res
 * @param {Error} error Service-Fehler (`CODE:Nachricht`)
 * @param {{status?:number, code:string, error:string}} fallback Endpoint-Default
 */
const sendServiceError = (res, error, fallback) => {
  const known = extractKnownError(error && error.message);
  if (known) {
    const [status, outCode] = ERROR_MAP[known.code];
    return res.status(status).json({
      success: false,
      error: known.message || fallback.error,
      code: outCode
    });
  }

  console.error(`${fallback.code}:`, error);
  return res.status(fallback.status || 500).json({
    success: false,
    error: fallback.error,
    code: fallback.code
  });
};

module.exports = { sendServiceError, extractKnownError };
