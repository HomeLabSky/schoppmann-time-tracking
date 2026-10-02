const path = require('path');
require('dotenv').config({ quiet: true });

/**
 * Zentrale Konfiguration.
 *
 * Bewusst OHNE Fallback-Geheimnisse: fehlen JWT_SECRET / JWT_REFRESH_SECRET,
 * startet das Backend nicht. NODE_ENV ist standardmäßig "production", damit
 * ein vergessener Eintrag nie Entwicklungsfunktionen freischaltet.
 */

const nodeEnv = process.env.NODE_ENV || 'production';

const requireSecret = (key) => {
  const value = process.env[key];
  if (!value || value.length < 32) {
    throw new Error(
      `❌ ${key} fehlt oder ist kürzer als 32 Zeichen. ` +
      `In backend/.env setzen (Vorlage: backend/.env.example). ` +
      `Erzeugen z. B. mit: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    );
  }
  return value;
};

const asBool = (value, defaultValue = false) =>
  value === undefined ? defaultValue : ['true', '1', 'yes'].includes(String(value).toLowerCase());

const asList = (value) =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];

// Relative DB-Pfade beziehen sich auf den backend-Ordner, nicht auf das
// aktuelle Arbeitsverzeichnis – sonst entsteht beim Start aus einem anderen
// Ordner unbemerkt eine neue, leere Datenbank.
const resolveStorage = (storage) =>
  storage === ':memory:' ? storage : path.resolve(__dirname, '..', storage);

const config = {
  // Server
  port: parseInt(process.env.PORT) || 5000,
  nodeEnv,
  // Hinter einem Reverse-Proxy (nginx, Traefik …) auf die Anzahl Proxys setzen,
  // damit Rate-Limits die echte Client-IP verwenden.
  trustProxy: process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY) : false,

  // Geheimnisse: JWT_SECRET signiert die Zugriffs-Tokens, JWT_REFRESH_SECRET sichert die in der
  // Datenbank gespeicherten Prüfwerte der Erneuerungs-Tokens (HMAC) – beide müssen gesetzt sein.
  jwt: {
    secret: requireSecret('JWT_SECRET'),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET')
  },

  // Anmeldung über httpOnly-Cookies mit Sitzungen in der Datenbank
  auth: {
    // Zugriffs-Token (JWT): kurz gültig; wird über das Erneuerungs-Token still verlängert
    accessTtlSeconds: parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS) || 15 * 60,
    // Erneuerungs-Token: gleitend, wird bei jeder Nutzung rotiert
    refreshTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS) || 7,
    // Absolute Obergrenze einer Sitzung, danach ist eine neue Anmeldung nötig
    sessionMaxDays: parseInt(process.env.SESSION_MAX_DAYS) || 30,
    // Parallele Erneuerung (zwei Tabs): ein soeben rotiertes Token gilt noch kurz als "in Arbeit"
    refreshGraceSeconds: 10,
    // Cookie-Attribut Secure: in Produktion an (HTTPS), lokal per http aus
    cookieSecure: process.env.COOKIE_SECURE !== undefined
      ? asBool(process.env.COOKIE_SECURE)
      : nodeEnv === 'production',
    accessCookie: 'zeit_access',
    refreshCookie: 'zeit_refresh'
  },

  // Database
  database: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: resolveStorage(process.env.DB_STORAGE || './database/timetracking.db'),
    logging: process.env.DB_LOGGING === 'true' || false
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN ?
      process.env.CORS_ORIGIN.split(',') :
      ['http://localhost:3000'],
    credentials: true
  },

  // Selbstregistrierung (Standard: aus – Konten legt ein Admin an)
  allowRegistration: asBool(process.env.ALLOW_REGISTRATION, false),
  // Optional: nur diese E-Mail-Domains zulassen (leer = keine Einschränkung)
  allowedEmailDomains: asList(process.env.ALLOWED_EMAIL_DOMAINS),

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    general: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    login: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Development Info (keine Secret-Längen oder -Werte ausgeben)
if (config.nodeEnv === 'development') {
  console.log('🔧 Development Configuration loaded');
  console.log(`📊 Database: ${config.database.dialect} (${config.database.storage})`);
}

module.exports = config;
