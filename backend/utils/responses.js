/**
 * ✅ Response Utils - Standardisierte API-Responses
 * Enthält Helper-Funktionen für konsistente API-Antworten
 */

/**
 * Standard Success Response
 * @param {Object} res - Express Response Objekt
 * @param {Object} data - Response Data
 * @param {string} message - Success Message
 * @param {number} statusCode - HTTP Status Code (default: 200)
 */
const sendSuccess = (res, data = null, message = 'Erfolgreich', statusCode = 200) => {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString()
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Standard Error Response
 * @param {Object} res - Express Response Objekt
 * @param {string} error - Error Message
 * @param {string} code - Error Code
 * @param {number} statusCode - HTTP Status Code (default: 400)
 * @param {Object} details - Additional Error Details
 */
const sendError = (res, error = 'Ein Fehler ist aufgetreten', code = 'UNKNOWN_ERROR', statusCode = 400, details = null) => {
  const response = {
    success: false,
    error,
    code,
    timestamp: new Date().toISOString()
  };

  if (details !== null) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Validation Error Response
 * @param {Object} res - Express Response Objekt
 * @param {Array} errors - Array von Validation Errors
 * @param {string} message - Error Message
 */
const sendValidationError = (res, errors = [], message = 'Eingabefehler') => {
  return sendError(res, message, 'VALIDATION_ERROR', 400, {
    validationErrors: errors,
    count: errors.length
  });
};

/**
 * Authentication Error Response
 * @param {Object} res - Express Response Objekt
 * @param {string} message - Error Message
 * @param {string} code - Specific Auth Error Code
 */
const sendAuthError = (res, message = 'Authentifizierung fehlgeschlagen', code = 'AUTH_ERROR') => {
  return sendError(res, message, code, 401);
};

/**
 * Authorization Error Response (403 Forbidden)
 * @param {Object} res - Express Response Objekt
 * @param {string} message - Error Message
 * @param {string} userRole - User's current role (for debugging)
 */
const sendAuthorizationError = (res, message = 'Nicht autorisiert', userRole = null) => {
  const details = userRole ? { userRole, requiredRole: 'admin' } : null;
  return sendError(res, message, 'AUTHORIZATION_ERROR', 403, details);
};

/**
 * Not Found Error Response
 * @param {Object} res - Express Response Objekt
 * @param {string} resource - Resource Name (z.B. 'Benutzer')
 * @param {string} identifier - Resource Identifier (z.B. ID)
 */
const sendNotFoundError = (res, resource = 'Ressource', identifier = null) => {
  const message = identifier ? 
    `${resource} mit ID ${identifier} nicht gefunden` : 
    `${resource} nicht gefunden`;
  
  return sendError(res, message, 'NOT_FOUND', 404, {
    resource,
    identifier
  });
};

/**
 * Conflict Error Response (409)
 * @param {Object} res - Express Response Objekt
 * @param {string} message - Conflict Message
 * @param {Object} conflictData - Data about the conflict
 */
const sendConflictError = (res, message = 'Konflikt', conflictData = null) => {
  return sendError(res, message, 'CONFLICT', 409, conflictData);
};

/**
 * Rate Limit Error Response
 * @param {Object} res - Express Response Objekt
 * @param {number} retryAfter - Seconds until retry is allowed
 * @param {string} limitType - Type of limit (e.g., 'login', 'api')
 */
const sendRateLimitError = (res, retryAfter = 900, limitType = 'general') => {
  return sendError(res, 'Rate Limit überschritten', 'RATE_LIMIT_EXCEEDED', 429, {
    retryAfter,
    limitType,
    retryAfterFormatted: `${Math.ceil(retryAfter / 60)} Minuten`
  });
};

/**
 * Database Error Response
 * @param {Object} res - Express Response Objekt
 * @param {Error} error - Database Error Object
 * @param {string} operation - Database Operation (e.g., 'create', 'update')
 */
const sendDatabaseError = (res, error, operation = 'operation') => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const message = `Datenbankfehler bei ${operation}`;
  const details = isDevelopment ? {
    operation,
    errorName: error.name,
    errorMessage: error.message,
    sqlState: error.parent?.sqlState || null
  } : {
    operation,
    message: 'Kontaktieren Sie den Administrator'
  };

  return sendError(res, message, 'DATABASE_ERROR', 500, details);
};

/**
 * Paginated Success Response
 * @param {Object} res - Express Response Objekt
 * @param {Array} data - Array of items
 * @param {Object} pagination - Pagination info
 * @param {string} message - Success message
 */
const sendPaginatedSuccess = (res, data, pagination, message = 'Daten erfolgreich geladen') => {
  return sendSuccess(res, {
    items: data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrev: pagination.page > 1
    }
  }, message);
};

/**
 * Created Response (201)
 * @param {Object} res - Express Response Objekt
 * @param {Object} data - Created Resource Data
 * @param {string} message - Success Message
 */
const sendCreated = (res, data, message = 'Erfolgreich erstellt') => {
  return sendSuccess(res, data, message, 201);
};

/**
 * No Content Response (204)
 * @param {Object} res - Express Response Objekt
 */
const sendNoContent = (res) => {
  return res.status(204).send();
};

/**
 * Custom Status Response
 * @param {Object} res - Express Response Objekt
 * @param {number} statusCode - HTTP Status Code
 * @param {Object} data - Response Data
 * @param {string} message - Message
 * @param {boolean} success - Success Flag
 */
const sendCustomStatus = (res, statusCode, data = null, message = '', success = true) => {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString()
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Development Debug Response (nur in Development)
 * @param {Object} res - Express Response Objekt
 * @param {Object} debugData - Debug Information
 * @param {string} message - Debug Message
 */
const sendDebugInfo = (res, debugData, message = 'Debug Information') => {
  if (process.env.NODE_ENV !== 'development') {
    return sendError(res, 'Debug-Informationen nur in Development verfügbar', 'DEBUG_NOT_AVAILABLE', 403);
  }

  return sendSuccess(res, {
    debug: debugData,
    environment: 'development',
    warning: 'Diese Daten sind nur in Development sichtbar'
  }, message);
};

/**
 * Health Check Response
 * @param {Object} res - Express Response Objekt
 * @param {Object} healthData - Health Status Data
 * @param {boolean} isHealthy - Overall Health Status
 */
const sendHealthCheck = (res, healthData, isHealthy = true) => {
  const statusCode = isHealthy ? 200 : 503;
  const message = isHealthy ? 'Service ist gesund' : 'Service hat Probleme';

  return res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    message,
    timestamp: new Date().toISOString(),
    checks: healthData
  });
};

/**
 * API Documentation Response
 * @param {Object} res - Express Response Objekt
 * @param {Object} apiInfo - API Information
 */
const sendApiDocumentation = (res, apiInfo) => {
  return sendSuccess(res, {
    api: apiInfo,
    documentation: {
      version: 'v2.0.0',
      baseUrl: '/api',
      authentication: 'Bearer Token',
      rateLimit: 'Active',
      supportedFormats: ['JSON'],
      timezone: 'UTC'
    }
  }, 'API-Dokumentation');
};

/**
 * Wrapper für async Route Handler mit automatischem Error Handling
 * @param {Function} fn - Async Route Handler Function
 * @returns {Function} Wrapped Route Handler
 */
const asyncWrapper = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Response Metrics Helper (für Monitoring)
 * @param {Object} req - Express Request Object
 * @param {Object} res - Express Response Object
 * @param {number} startTime - Request Start Time
 * @returns {Object} Response Metrics
 */
const getResponseMetrics = (req, res, startTime) => {
  return {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    responseTime: Date.now() - startTime,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  // Success Responses
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendPaginatedSuccess,
  
  // Error Responses
  sendError,
  sendValidationError,
  sendAuthError,
  sendAuthorizationError,
  sendNotFoundError,
  sendConflictError,
  sendRateLimitError,
  sendDatabaseError,
  
  // Special Responses
  sendCustomStatus,
  sendDebugInfo,
  sendHealthCheck,
  sendApiDocumentation,
  
  // Utilities
  asyncWrapper,
  getResponseMetrics
};