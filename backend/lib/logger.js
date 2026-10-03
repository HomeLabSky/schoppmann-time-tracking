/**
 * Strukturiertes Logging (pino, JSON pro Zeile).
 *
 * Datenschutz: Es werden keine E-Mail-Adressen, Namen, Passwörter, Tokens oder Cookies geloggt – Personen
 * erscheinen nur als Benutzer-ID. Jede Anfrage hat eine Request-ID (Header X-Request-ID), die auch in
 * Fehlerantworten steht; damit lässt sich eine Meldung eines Benutzers dem Log zuordnen.
 *
 * Stufe über LOG_LEVEL (Standard: info; in Tests: silent). In der Entwicklung lesbar formatiert, wenn
 * pino-pretty installiert ist.
 */
const pino = require('pino');

const nodeEnv = process.env.NODE_ENV || 'production';
const level = process.env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info');

const prettyTransport = () => {
  if (nodeEnv !== 'development') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } };
  } catch {
    return undefined;
  }
};

const logger = pino({
  level,
  base: { service: 'zeiterfassung-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Sicherheitsnetz, falls doch einmal ein Objekt mit solchen Feldern geloggt wird
  redact: {
    paths: [
      'password', '*.password', 'currentPassword', 'newPassword',
      'email', '*.email', 'name', '*.name',
      'token', '*.token', 'accessToken', '*.accessToken', 'refreshToken', '*.refreshToken',
      'req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'
    ],
    censor: '[entfernt]'
  },
  transport: prettyTransport()
});

module.exports = logger;
