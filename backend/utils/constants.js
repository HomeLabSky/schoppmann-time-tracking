/**
 * ✅ Constants - Zentrale Konstanten und Enums
 * Enthält alle wiederverwendbaren Konstanten der Anwendung
 */

// ✅ User Roles
const USER_ROLES = {
  ADMIN: 'admin',
  EMPLOYEE: 'mitarbeiter'
};

// ✅ HTTP Status Codes
const HTTP_STATUS = {
  // Success
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  
  // Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  
  // Server Errors
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// ✅ Error Codes
const ERROR_CODES = {
  // Authentication & Authorization
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // User Management
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  USER_INACTIVE: 'USER_INACTIVE',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  INVALID_USER_ROLE: 'INVALID_USER_ROLE',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_DATE_FORMAT: 'INVALID_DATE_FORMAT',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  
  // Minijob Management
  MINIJOB_SETTING_NOT_FOUND: 'MINIJOB_SETTING_NOT_FOUND',
  OVERLAPPING_PERIODS: 'OVERLAPPING_PERIODS',
  CANNOT_DELETE_ACTIVE: 'CANNOT_DELETE_ACTIVE',
  NO_CURRENT_SETTING: 'NO_CURRENT_SETTING',
  
  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  LOGIN_RATE_LIMIT_EXCEEDED: 'LOGIN_RATE_LIMIT_EXCEEDED',

  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  ENDPOINT_NOT_FOUND: 'ENDPOINT_NOT_FOUND',
  
  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

// ✅ Success Messages
const SUCCESS_MESSAGES = {
  // Authentication
  LOGIN_SUCCESS: 'Login erfolgreich',
  LOGOUT_SUCCESS: 'Erfolgreich abgemeldet',
  REGISTRATION_SUCCESS: 'Registrierung erfolgreich',
  TOKEN_REFRESH_SUCCESS: 'Token erfolgreich erneuert',
  
  // User Management
  USER_CREATED: 'Benutzer erfolgreich erstellt',
  USER_UPDATED: 'Benutzer erfolgreich aktualisiert',
  USER_DELETED: 'Benutzer erfolgreich gelöscht',
  PROFILE_UPDATED: 'Profil erfolgreich aktualisiert',
  PASSWORD_CHANGED: 'Passwort erfolgreich geändert',
  SETTINGS_UPDATED: 'Einstellungen erfolgreich aktualisiert',
  
  // Minijob Management
  MINIJOB_SETTING_CREATED: 'Minijob-Einstellung erfolgreich erstellt',
  MINIJOB_SETTING_UPDATED: 'Minijob-Einstellung erfolgreich aktualisiert',
  MINIJOB_SETTING_DELETED: 'Minijob-Einstellung erfolgreich gelöscht',
  MINIJOB_STATUS_REFRESHED: 'Minijob-Status erfolgreich aktualisiert',
  PERIODS_RECALCULATED: 'Zeiträume erfolgreich neu berechnet',
  
  // General
  DATA_LOADED: 'Daten erfolgreich geladen',
  OPERATION_SUCCESS: 'Vorgang erfolgreich abgeschlossen'
};

// ✅ Error Messages
const ERROR_MESSAGES = {
  // Authentication
  INVALID_CREDENTIALS: 'Email oder Passwort falsch',
  TOKEN_EXPIRED: 'Token ist abgelaufen',
  TOKEN_INVALID: 'Ungültiger Token',
  INSUFFICIENT_PERMISSIONS: 'Nicht genügend Berechtigungen',
  
  // User Management
  USER_NOT_FOUND: 'Benutzer nicht gefunden',
  USER_ALREADY_EXISTS: 'Benutzer existiert bereits',
  EMAIL_EXISTS: 'Email bereits vergeben',
  USER_INACTIVE: 'Benutzer ist deaktiviert',
  
  // Validation
  VALIDATION_ERROR: 'Eingabefehler',
  MISSING_REQUIRED_FIELD: 'Pflichtfeld fehlt',
  INVALID_EMAIL: 'Ungültige Email-Adresse',
  INVALID_PASSWORD: 'Ungültiges Passwort',
  
  // Minijob
  NO_CURRENT_SETTING: 'Keine aktuelle Minijob-Einstellung gefunden',
  OVERLAPPING_PERIODS: 'Zeiträume überschneiden sich',
  CANNOT_DELETE_ACTIVE: 'Aktive Einstellungen können nicht gelöscht werden',
  
  // General
  INTERNAL_ERROR: 'Interner Serverfehler',
  DATABASE_ERROR: 'Datenbankfehler',
  RATE_LIMIT_EXCEEDED: 'Zu viele Anfragen'
};

// ✅ Validation Rules
const VALIDATION_RULES = {
  USER: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 50,
    PASSWORD_MIN_LENGTH: 8,
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/
  },
  MINIJOB: {
    MONTHLY_LIMIT_MIN: 0,
    MONTHLY_LIMIT_MAX: 999999.99,
    DESCRIPTION_MIN_LENGTH: 3,
    DESCRIPTION_MAX_LENGTH: 500
  },
  GENERAL: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    DATE_FORMAT: 'YYYY-MM-DD',
    DATETIME_FORMAT: 'YYYY-MM-DD HH:mm:ss'
  }
};

// ✅ Default Values
const DEFAULTS = {
  USER: {
    ROLE: USER_ROLES.EMPLOYEE,
    HOURLY_RATE: 12.00,
    BILLING_START_DAY: 1,
    BILLING_END_DAY: 31,
    IS_ACTIVE: true
  },
  MINIJOB: {
    MONTHLY_LIMIT: 538.00, // Stand 2024
    DESCRIPTION: 'Standard Minijob-Grenze'
  },
  PAGINATION: {
    PAGE: 1,
    LIMIT: 20
  },
  TOKEN: {
    ACCESS_EXPIRES_IN: '15m',
    REFRESH_EXPIRES_IN: '7d'
  }
};

// ✅ Rate Limiting
const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: 15 * 60 * 1000, // 15 Minuten
    MAX_REQUESTS: 100
  },
  LOGIN: {
    WINDOW_MS: 15 * 60 * 1000, // 15 Minuten
    MAX_ATTEMPTS: 5
  },
  REGISTRATION: {
    WINDOW_MS: 60 * 60 * 1000, // 1 Stunde
    MAX_ATTEMPTS: 3
  },
  API: {
    WINDOW_MS: 15 * 60 * 1000, // 15 Minuten
    MAX_REQUESTS: 200
  },
  ADMIN: {
    WINDOW_MS: 15 * 60 * 1000, // 15 Minuten
    MAX_REQUESTS: 300
  }
};

// ✅ Database Configuration
const DATABASE = {
  DIALECTS: {
    SQLITE: 'sqlite',
    MYSQL: 'mysql',
    POSTGRES: 'postgres'
  },
  DEFAULT_STORAGE: './database/timetracking.db',
  CONNECTION_TIMEOUT: 60000,
  QUERY_TIMEOUT: 30000
};

// ✅ File Paths
const PATHS = {
  LOGS: './logs',
  UPLOADS: './uploads',
  TEMP: './temp',
  DATABASE: './database',
  BACKUP: './backup'
};

// ✅ Date Formats
const DATE_FORMATS = {
  ISO_DATE: 'YYYY-MM-DD',
  GERMAN_DATE: 'DD.MM.YYYY',
  ISO_DATETIME: 'YYYY-MM-DD HH:mm:ss',
  ISO_TIMESTAMP: 'YYYY-MM-DDTHH:mm:ss.sssZ'
};

// ✅ Security Settings
const SECURITY = {
  BCRYPT_ROUNDS: 10,
  JWT_ISSUER: 'schoppmann-timetracking',
  JWT_AUDIENCE: 'schoppmann-users',
  CORS_ORIGINS: ['http://localhost:3000'],
  HELMET_CONFIG: {
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }
};

// ✅ Environment Types
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
  STAGING: 'staging'
};

// ✅ Log Levels
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// ✅ API Versions
const API_VERSIONS = {
  V1: 'v1',
  V2: 'v2',
  CURRENT: 'v2'
};

// ✅ Content Types
const CONTENT_TYPES = {
  JSON: 'application/json',
  XML: 'application/xml',
  HTML: 'text/html',
  PLAIN: 'text/plain',
  CSV: 'text/csv',
  PDF: 'application/pdf'
};

// ✅ Regex Patterns
const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
  DATE_ISO: /^\d{4}-\d{2}-\d{2}$/,
  DATE_GERMAN: /^\d{2}\.\d{2}\.\d{4}$/,
  PHONE: /^[+]?[\d\s\-\(\)]+$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
};

// ✅ Export alles
module.exports = {
  USER_ROLES,
  HTTP_STATUS,
  ERROR_CODES,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  VALIDATION_RULES,
  DEFAULTS,
  RATE_LIMITS,
  DATABASE,
  PATHS,
  DATE_FORMATS,
  SECURITY,
  ENVIRONMENTS,
  LOG_LEVELS,
  API_VERSIONS,
  CONTENT_TYPES,
  REGEX_PATTERNS
};