const path = require('path');
// backend/.env – unabhängig vom Startverzeichnis (wie der DB-Pfad)
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { z } = require('zod');

/**
 * Zentrale Konfiguration aus Umgebungsvariablen, mit zod geprüft.
 *
 * Fehlt ein Pflichtwert oder ist ein Wert ungültig (z. B. PORT=abc), startet das Backend nicht und nennt
 * die betroffene Variable – statt still auf einen Standardwert auszuweichen.
 * Bewusst OHNE Fallback-Geheimnisse. NODE_ENV ist standardmäßig "production", damit ein vergessener
 * Eintrag nie Entwicklungsfunktionen freischaltet.
 */

const secret = (name) =>
  z.string({ error: `${name} fehlt` }).min(32, `${name} muss mindestens 32 Zeichen lang sein`);

const int = (fallback, { min = 0 } = {}) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(min).default(fallback)
  );

const bool = (fallback) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : ['true', '1', 'yes'].includes(String(value).toLowerCase())),
    z.boolean().default(fallback)
  );

const list = () =>
  z.string().optional().transform((value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []));

// Leere Werte (`KEY=` in der .env) gelten als nicht gesetzt
const optionalText = (fallback) =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().default(fallback));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  PORT: int(5000, { min: 1 }),
  TRUST_PROXY: z.preprocess((v) => (v === undefined || v === '' ? undefined : v), z.coerce.number().int().min(0).optional()),

  JWT_SECRET: secret('JWT_SECRET'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),

  ACCESS_TOKEN_TTL_SECONDS: int(15 * 60, { min: 60 }),
  REFRESH_TOKEN_TTL_DAYS: int(7, { min: 1 }),
  SESSION_MAX_DAYS: int(30, { min: 1 }),
  APP_REFRESH_TOKEN_TTL_DAYS: int(30, { min: 1 }),
  APP_SESSION_MAX_DAYS: int(90, { min: 1 }),
  COOKIE_SECURE: z.string().optional(),

  LOGIN_LOCK_THRESHOLD: int(5, { min: 1 }),
  LOGIN_LOCK_MINUTES: int(15, { min: 1 }),

  DB_DIALECT: z.literal('sqlite').default('sqlite'),
  DB_STORAGE: optionalText('./database/timetracking.db'),
  DB_LOGGING: bool(false),

  CORS_ORIGIN: list(),
  ALLOW_REGISTRATION: bool(false),
  ALLOWED_EMAIL_DOMAINS: list(),

  RATE_LIMIT_WINDOW_MS: int(15 * 60 * 1000, { min: 1000 }),
  RATE_LIMIT_MAX_REQUESTS: int(100, { min: 1 }),
  RATE_LIMIT_LOGIN_MAX: int(5, { min: 1 }),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional()
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(
    `Ungültige Konfiguration (backend/.env, Vorlage: backend/.env.example):\n${problems}\n` +
    'Geheimnisse erzeugen z. B. mit: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}
const env = parsed.data;

// Relative DB-Pfade beziehen sich auf den backend-Ordner, nicht auf das aktuelle Arbeitsverzeichnis – sonst
// entsteht beim Start aus einem anderen Ordner unbemerkt eine neue, leere Datenbank.
const resolveStorage = (storage) =>
  storage === ':memory:' ? storage : path.resolve(__dirname, '..', storage);

const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  // Hinter einem Reverse-Proxy auf die Anzahl Proxys setzen, damit Rate-Limits die echte Client-IP verwenden
  trustProxy: env.TRUST_PROXY === undefined ? false : env.TRUST_PROXY,

  // JWT_SECRET signiert die Zugriffs-Tokens, JWT_REFRESH_SECRET sichert die in der Datenbank gespeicherten
  // Prüfwerte der Erneuerungs-Tokens (HMAC) – beide müssen gesetzt sein.
  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET
  },

  auth: {
    // Zugriffs-Token (JWT): kurz gültig; wird über das Erneuerungs-Token still verlängert
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    // Web (Cookies): Erneuerung gleitend, absolute Obergrenze je Sitzung
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    sessionMaxDays: env.SESSION_MAX_DAYS,
    // App (Bearer): längere Laufzeiten, das Token liegt im sicheren Gerätespeicher
    app: {
      refreshTtlDays: env.APP_REFRESH_TOKEN_TTL_DAYS,
      sessionMaxDays: env.APP_SESSION_MAX_DAYS
    },
    // Parallele Erneuerung (zwei Tabs): ein soeben rotiertes Token gilt noch kurz als "in Arbeit"
    refreshGraceSeconds: 10,
    // Cookie-Attribut Secure: in Produktion an (HTTPS), lokal per http aus
    cookieSecure: env.COOKIE_SECURE !== undefined
      ? ['true', '1', 'yes'].includes(env.COOKIE_SECURE.toLowerCase())
      : env.NODE_ENV === 'production',
    accessCookie: 'zeit_access',
    refreshCookie: 'zeit_refresh',
    // Konto-Sperre: nach `threshold` Fehlversuchen `minutes` Minuten, bei weiteren Fehlversuchen verdoppelt
    lock: {
      threshold: env.LOGIN_LOCK_THRESHOLD,
      minutes: env.LOGIN_LOCK_MINUTES
    }
  },

  database: {
    dialect: env.DB_DIALECT,
    storage: resolveStorage(env.DB_STORAGE),
    logging: env.DB_LOGGING
  },

  cors: {
    origin: env.CORS_ORIGIN.length > 0 ? env.CORS_ORIGIN : ['http://localhost:3000'],
    credentials: true
  },

  // Selbstregistrierung (Standard: aus – Konten legt ein Admin an)
  allowRegistration: env.ALLOW_REGISTRATION,
  // Optional: nur diese E-Mail-Domains zulassen (leer = keine Einschränkung)
  allowedEmailDomains: env.ALLOWED_EMAIL_DOMAINS,

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    general: env.RATE_LIMIT_MAX_REQUESTS,
    login: env.RATE_LIMIT_LOGIN_MAX
  }
};

module.exports = config;
