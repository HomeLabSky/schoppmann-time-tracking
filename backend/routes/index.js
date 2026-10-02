const express = require('express');

// ✅ Middleware importieren
const { authenticatedAPI, adminAPI } = require('../middleware');
const { loginLimiter, registrationLimiter } = require('../middleware/rateLimiting');

// ✅ Route-Module importieren
const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const employeeRoutes = require('./employee');
const minijobRoutes = require('./minijob');
const timeTrackingRoutes = require('./timetracking');
const timesheetRoutes = require('./timesheets');
const auditRoutes = require('./audit');

const router = express.Router();

// ✅ API Info Route (bewusst knapp: keine Abhängigkeitsversionen oder Interna)
router.get('/', (req, res) => {
  res.json({
    message: 'Schoppmann Time Tracking API',
    version: '2.0.0'
  });
});

// ============ ROUTE REGISTRIERUNGEN ============

// ✅ AUTH ROUTES
// Login und Registration haben spezielle Rate Limits
router.use('/auth/login', loginLimiter);
router.use('/auth/register', registrationLimiter);
router.use('/auth', authRoutes);

// ✅ ZEITERFASSUNG ROUTES (Authentifizierung erforderlich)
router.use('/timetracking', authenticatedAPI, timeTrackingRoutes);

// ✅ EMPLOYEE ROUTES (Authentifizierung erforderlich)
router.use('/employee', authenticatedAPI, employeeRoutes);

// ✅ ADMIN ROUTES (Admin-Berechtigung erforderlich)
router.use('/admin', adminAPI, adminRoutes);

// ✅ MINIJOB ROUTES (Teil der Admin-Routes)
router.use('/admin/minijob', adminAPI, minijobRoutes);

// ✅ ZEITNACHWEISE & MONATSABSCHLUSS (Admin)
router.use('/admin/timesheets', adminAPI, timesheetRoutes);

// ✅ ÄNDERUNGSPROTOKOLL (Admin, nur lesend)
router.use('/admin/audit', adminAPI, auditRoutes);

// ✅ API Status Route (für Health Checks, ohne Details)
router.get('/status', (req, res) => {
  res.json({ status: 'OK' });
});

// ✅ 404 Handler für API-Routen
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API-Endpoint nicht gefunden',
    code: 'ENDPOINT_NOT_FOUND'
  });
});

module.exports = router;
