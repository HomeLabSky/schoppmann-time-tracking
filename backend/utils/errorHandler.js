const config = require('../config');
const { HTTP_STATUS, ERROR_CODES, ERROR_MESSAGES } = require('./constants');
const { sendError, sendDatabaseError, sendRateLimitError } = require('./responses');

/**
 * ✅ Error Handler Utils - Zentrale Fehlerbehandlung
 * Enthält alle Error-Handling Funktionen und Custom Error Classes
 */

/**
 * Custom Application Error Class
 */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, code = ERROR_CODES.UNKNOWN_ERROR, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Authentication Error Class
 */
class AuthError extends AppError {
  constructor(message = ERROR_MESSAGES.INVALID_CREDENTIALS, code = ERROR_CODES.INVALID_CREDENTIALS) {
    super(message, HTTP_STATUS.UNAUTHORIZED, code);
    this.name = 'AuthError';
  }
}

/**
 * Authorization Error Class
 */
class AuthorizationError extends AppError {
  constructor(message = ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS, userRole = null) {
    const details = userRole ? { userRole, requiredRole: 'admin' } : null;
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.INSUFFICIENT_PERMISSIONS, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Validation Error Class
 */
class ValidationError extends AppError {
  constructor(message = ERROR_MESSAGES.VALIDATION_ERROR, validationErrors = []) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, {
      validationErrors,
      count: validationErrors.length
    });
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error Class
 */
class NotFoundError extends AppError {
  constructor(resource = 'Ressource', identifier = null) {
    const message = identifier ? 
      `${resource} mit ID ${identifier} nicht gefunden` : 
      `${resource} nicht gefunden`;
    
    super(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, {
      resource,
      identifier
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error Class
 */
class ConflictError extends AppError {
  constructor(message, conflictData = null) {
    super(message, HTTP_STATUS.CONFLICT, ERROR_CODES.CONFLICT, conflictData);
    this.name = 'ConflictError';
  }
}

/**
 * Database Error Class
 */
class DatabaseError extends AppError {
  constructor(message, originalError = null, operation = 'operation') {
    const details = {
      operation,
      originalError: config.nodeEnv === 'development' ? originalError?.message : 'Kontaktieren Sie den Administrator'
    };
    
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.DATABASE_ERROR, details);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * Service Error Parser - Parst Service Error Messages
 * @param {string} errorMessage - Error Message im Format "CODE:Message"
 * @returns {Object} { code, message }
 */
const parseServiceError = (errorMessage) => {
  if (typeof errorMessage === 'string' && errorMessage.includes(':')) {
    const [code, ...messageParts] = errorMessage.split(':');
    return {
      code: code.trim(),
      message: messageParts.join(':').trim()
    };
  }
  
  return {
    code: ERROR_CODES.UNKNOWN_ERROR,
    message: errorMessage
  };
};

/**
 * Service Error zu HTTP Error Mapper
 * @param {Error} error - Service Error
 * @returns {AppError} Mapped HTTP Error
 */
const mapServiceError = (error) => {
  const { code, message } = parseServiceError(error.message);
  
  switch (code) {
    // Authentication Errors
    case 'INVALID_CREDENTIALS':
    case 'USER_INACTIVE':
      return new AuthError(message, code);
    
    // Authorization Errors
    case 'INSUFFICIENT_PERMISSIONS':
    case 'CANNOT_DEACTIVATE_SELF':
      return new AuthorizationError(message);
    
    // Not Found Errors
    case 'USER_NOT_FOUND':
    case 'SETTING_NOT_FOUND':
    case 'MINIJOB_SETTING_NOT_FOUND':
      return new NotFoundError(message);
    
    // Conflict Errors
    case 'USER_ALREADY_EXISTS':
    case 'EMAIL_EXISTS':
    case 'OVERLAPPING_PERIODS':
      return new ConflictError(message);
    
    // Validation Errors
    case 'VALIDATION_ERROR':
    case 'INVALID_ROLE':
    case 'INVALID_HOURLY_RATE':
    case 'INVALID_BILLING_START':
    case 'INVALID_BILLING_END':
    case 'INVALID_DATE_FORMAT':
    case 'INVALID_DATE_RANGE':
      return new ValidationError(message);
    
    // Bad Request Errors
    case 'CANNOT_DELETE_ACTIVE':
    case 'INVALID_CURRENT_PASSWORD':
      return new AppError(message, HTTP_STATUS.BAD_REQUEST, code);
    
    // Database Errors
    case 'DATABASE_ERROR':
    case 'TRANSACTION_FAILED':
      return new DatabaseError(message, error);
    
    default:
      return new AppError(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, code);
  }
};

/**
 * Sequelize Error Handler
 * @param {Error} error - Sequelize Error
 * @returns {AppError} Mapped Error
 */
const handleSequelizeError = (error) => {
  switch (error.name) {
    case 'SequelizeValidationError':
      const validationErrors = error.errors.map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      return new ValidationError('Datenbankvalidierung fehlgeschlagen', validationErrors);
    
    case 'SequelizeUniqueConstraintError':
      const field = error.errors[0]?.path || 'Feld';
      return new ConflictError(`${field} bereits vorhanden`);
    
    case 'SequelizeForeignKeyConstraintError':
      return new ValidationError('Referenz-Constraint verletzt');
    
    case 'SequelizeConnectionError':
    case 'SequelizeConnectionRefusedError':
      return new DatabaseError('Datenbankverbindung fehlgeschlagen', error);
    
    case 'SequelizeTimeoutError':
      return new DatabaseError('Datenbank-Timeout', error);
    
    default:
      return new DatabaseError('Unbekannter Datenbankfehler', error);
  }
};

/**
 * JWT Error Handler
 * @param {Error} error - JWT Error
 * @returns {AppError} Mapped Error
 */
const handleJWTError = (error) => {
  switch (error.name) {
    case 'TokenExpiredError':
      return new AuthError('Token ist abgelaufen', ERROR_CODES.TOKEN_EXPIRED);
    
    case 'JsonWebTokenError':
      return new AuthError('Ungültiger Token', ERROR_CODES.TOKEN_INVALID);
    
    case 'NotBeforeError':
      return new AuthError('Token ist noch nicht gültig', ERROR_CODES.TOKEN_INVALID);
    
    default:
      return new AuthError('Token-Verarbeitung fehlgeschlagen', ERROR_CODES.TOKEN_INVALID);
  }
};

/**
 * Zentraler Error Handler Middleware
 * @param {Error} err - Error Object
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 * @param {Function} next - Express Next Function
 */
const globalErrorHandler = (err, req, res, next) => {
  let error = err;

  // Log Error (nur in Development detailliert)
  if (config.nodeEnv === 'development') {
    console.error('❌ Global Error Handler:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  } else {
    console.error('❌ Error:', error.message);
  }

  // Bereits behandelte AppErrors durchreichen
  if (error instanceof AppError) {
    return sendError(res, error.message, error.code, error.statusCode, error.details);
  }

  // Service Errors mappen
  if (error.message && typeof error.message === 'string' && error.message.includes(':')) {
    error = mapServiceError(error);
    return sendError(res, error.message, error.code, error.statusCode, error.details);
  }

  // Sequelize Errors behandeln
  if (error.name && error.name.startsWith('Sequelize')) {
    error = handleSequelizeError(error);
    return sendDatabaseError(res, error.originalError || error, 'database operation');
  }

  // JWT Errors behandeln
  if (error.name && (error.name.includes('Token') || error.name === 'JsonWebTokenError')) {
    error = handleJWTError(error);
    return sendError(res, error.message, error.code, error.statusCode);
  }

  // Rate Limit Errors
  if (error.statusCode === 429) {
    return sendRateLimitError(res, error.retryAfter || 900, error.limitType || 'general');
  }

  // Validation Errors (express-validator)
  if (error.name === 'ValidationError' && error.array) {
    const validationErrors = error.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));
    error = new ValidationError('Eingabevalidierung fehlgeschlagen', validationErrors);
    return sendError(res, error.message, error.code, error.statusCode, error.details);
  }

  // Unbehandelte Errors als Internal Server Error
  const internalError = new AppError(
    config.nodeEnv === 'development' ? error.message : 'Interner Serverfehler',
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    ERROR_CODES.INTERNAL_ERROR,
    config.nodeEnv === 'development' ? {
      originalError: error.name,
      stack: error.stack
    } : null
  );

  return sendError(res, internalError.message, internalError.code, internalError.statusCode, internalError.details);
};

/**
 * Async Error Wrapper für Route Handler
 * @param {Function} fn - Async Route Handler
 * @returns {Function} Wrapped Handler
 */
const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found Handler
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 * @param {Function} next - Express Next Function
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError('Route', req.originalUrl);
  next(error);
};

/**
 * Error Logger (für Production)
 * @param {Error} error - Error Object
 * @param {Object} req - Express Request
 */
const logError = (error, req = null) => {
  const logData = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code || 'UNKNOWN'
    }
  };

  if (req) {
    logData.request = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId || null
    };
  }

  // In Production würde hier ein echter Logger verwendet (winston, etc.)
  console.error('Error Log:', JSON.stringify(logData, null, 2));
};

/**
 * Error Response Helper für spezifische Error Types
 */
const errorResponses = {
  /**
   * Sendet Authentication Error
   */
  sendAuthError: (res, message = ERROR_MESSAGES.INVALID_CREDENTIALS, code = ERROR_CODES.INVALID_CREDENTIALS) => {
    const error = new AuthError(message, code);
    return sendError(res, error.message, error.code, error.statusCode);
  },

  /**
   * Sendet Authorization Error
   */
  sendAuthorizationError: (res, message = ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS, userRole = null) => {
    const error = new AuthorizationError(message, userRole);
    return sendError(res, error.message, error.code, error.statusCode, error.details);
  },

  /**
   * Sendet Validation Error
   */
  sendValidationError: (res, message = ERROR_MESSAGES.VALIDATION_ERROR, errors = []) => {
    const error = new ValidationError(message, errors);
    return sendError(res, error.message, error.code, error.statusCode, error.details);
  },

  /**
   * Sendet Not Found Error
   */
  sendNotFoundError: (res, resource = 'Ressource', identifier = null) => {
    const error = new NotFoundError(resource, identifier);
    return sendError(res, error.message, error.code, error.statusCode, error.details);
  },

  /**
   * Sendet Conflict Error
   */
  sendConflictError: (res, message, conflictData = null) => {
    const error = new ConflictError(message, conflictData);
    return sendError(res, error.message, error.code, error.statusCode, error.details);
  }
};

module.exports = {
  // Error Classes
  AppError,
  AuthError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  
  // Error Handlers
  globalErrorHandler,
  asyncErrorHandler,
  notFoundHandler,
  
  // Error Mappers
  mapServiceError,
  handleSequelizeError,
  handleJWTError,
  parseServiceError,
  
  // Utilities
  logError,
  errorResponses
};