/**
 * API-Router: wird unter /api/v1 (verbindlich, für App und neue Clients) und – solange die Web-Oberfläche
 * umgestellt wird – zusätzlich unter /api eingehängt. Beide Pfade sind identisch.
 *
 * Neue, nicht abwärtskompatible Änderungen bekommen später /api/v2; installierte App-Versionen nutzen
 * /api/v1 weiter.
 */
const express = require('express');

const { authenticatedAPI, adminAPI } = require('../middleware');
const { loginLimiter, registrationLimiter } = require('../middleware/rateLimiting');
const { requireCsrfHeader } = require('../middleware/csrf');
const { notFound } = require('../middleware/errorHandler');
const { buildOpenApiDocument } = require('../lib/openapi');

const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const employeeRoutes = require('./employee');
const minijobRoutes = require('./minijob');
const timeTrackingRoutes = require('./timetracking');
const timesheetRoutes = require('./timesheets');
const auditRoutes = require('./audit');
const systemRoutes = require('./system');

const API_VERSION = '2.1.0';

const router = express.Router();

// API-Info (bewusst knapp: keine Abhängigkeitsversionen oder Interna)
router.get('/', (req, res) => {
  res.json({ message: 'Schoppmann Time Tracking API', version: API_VERSION, openapi: `${req.baseUrl}/openapi.json` });
});

// Health-Check ohne Details
router.get('/status', (req, res) => {
  res.json({ status: 'OK' });
});

// Maschinenlesbarer API-Vertrag (wird aus den Routen-Definitionen erzeugt)
let openApiDocument = null;
router.get('/openapi.json', (req, res) => {
  openApiDocument = openApiDocument || buildOpenApiDocument({ version: API_VERSION });
  res.json(openApiDocument);
});

// CSRF-Schutz: ändernde Cookie-Anfragen brauchen den Header X-CSRF-Protection
router.use(requireCsrfHeader);

// Anmeldung (Login, Token-Anmeldung der App und Registrierung mit eigenen Limits)
router.use('/auth/login', loginLimiter);
router.use('/auth/token', (req, res, next) => (req.path === '/' ? loginLimiter(req, res, next) : next()));
router.use('/auth/register', registrationLimiter);
router.use('/auth', authRoutes);

// Angemeldete Benutzer
router.use('/timetracking', authenticatedAPI, timeTrackingRoutes);
router.use('/employee', authenticatedAPI, employeeRoutes);

// Nur Admins
router.use('/admin', adminAPI, adminRoutes);
router.use('/admin/minijob', adminAPI, minijobRoutes);
router.use('/admin/timesheets', adminAPI, timesheetRoutes);
router.use('/admin/audit', adminAPI, auditRoutes);
router.use('/admin/system', adminAPI, systemRoutes);

router.use(notFound('ENDPOINT_NOT_FOUND'));

module.exports = router;
module.exports.API_VERSION = API_VERSION;
