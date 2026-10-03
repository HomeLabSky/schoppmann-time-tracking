/**
 * API-Router: wird unter /api/v1 (verbindlich, für App und neue Clients) und – solange die Web-Oberfläche
 * umgestellt wird – zusätzlich unter /api eingehängt. Beide Pfade sind identisch.
 *
 * Neue, nicht abwärtskompatible Änderungen bekommen später /api/v2; installierte App-Versionen nutzen
 * /api/v1 weiter.
 */
import express from 'express';

import { authenticatedAPI, adminAPI } from '../middleware';
import { loginLimiter, registrationLimiter } from '../middleware/rateLimiting';
import { requireCsrfHeader } from '../middleware/csrf';
import { notFound } from '../middleware/errorHandler';
import { buildOpenApiDocument } from '../lib/openapi';

import authRoutes from './auth';
import adminRoutes from './admin';
import employeeRoutes from './employee';
import minijobRoutes from './minijob';
import timeTrackingRoutes from './timetracking';
import timesheetRoutes from './timesheets';
import auditRoutes from './audit';
import systemRoutes from './system';

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
let openApiDocument: Record<string, unknown> | null = null;
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

export default router;
export { API_VERSION as API_VERSION };
