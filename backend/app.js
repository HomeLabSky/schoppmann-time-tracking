/**
 * Express-App-Aufbau (ohne Netzwerk-Listener).
 *
 * Middleware-Stack, API-Routen (/api/v1 und Alias /api), Basis-Routen (/, /health), 404 und zentraler
 * Error-Handler. Ruft NICHT `listen()` auf und initialisiert NICHT die Datenbank – das übernimmt server.js
 * (Betrieb) bzw. das Test-Skript. Dadurch ist die App ohne offenen Port testbar.
 *
 * Der DB-Verbindungsstatus wird über `app.locals.dbConnected` bereitgestellt und vom Starter gesetzt.
 */
const crypto = require('crypto');
const express = require('express');
const pinoHttp = require('pino-http');
const config = require('./config');
const logger = require('./lib/logger');

const { basicSecurity, generalLimiter } = require('./middleware');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();
app.disable('x-powered-by');

// Hinter einem Reverse-Proxy muss die echte Client-IP für Rate-Limits ermittelt werden.
if (config.trustProxy !== false) {
  app.set('trust proxy', config.trustProxy);
}

// Wird vom Starter (server.js) nach erfolgreicher DB-Initialisierung gesetzt.
app.locals.dbConnected = false;

// Request-ID (vom Proxy übernommen, wenn plausibel) und ein Logeintrag je Anfrage – ohne personenbezogene
// Daten: kein Query-String, keine Header, Benutzer nur als ID (siehe middleware/auth.js).
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-ID', id);
    return id;
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, path: req.url.split('?')[0] }),
    res: (res) => ({ statusCode: res.statusCode })
  },
  // Wer hat angefragt – nur als ID (gesetzt von middleware/auth.js)
  customProps: (req) => (req.user ? { userId: req.user.userId } : {}),
  customLogLevel: (req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: { ignore: (req) => req.url === '/health' }
}));

// Basis-Sicherheit (Helmet, CORS, Header)
app.use(basicSecurity);

// Body Parser mit Größenlimit
app.use(express.json({ limit: '1mb' }));

// Allgemeine Begrenzung pro IP
app.use(generalLimiter);

// API: /api/v1 ist verbindlich; /api bleibt als Alias für die bestehende Web-Oberfläche
app.use('/api/v1', apiRoutes);
app.use('/api', apiRoutes);

// Root (öffentlich, ohne Interna)
app.get('/', (req, res) => {
  res.json({ message: 'Schoppmann Time Tracking Server', status: 'online' });
});

// Health Check (öffentlich, ohne Versions-, Pfad- oder Speicherangaben)
app.get('/health', (req, res) => {
  const dbConnected = req.app.locals.dbConnected;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'OK' : 'DEGRADED',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime())
  });
});

app.use(notFound('ROUTE_NOT_FOUND'));
app.use(errorHandler);

module.exports = app;
