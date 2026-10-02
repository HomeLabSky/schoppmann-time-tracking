/**
 * Änderungsprotokoll (/api/admin/audit) – nur lesend, nur für Admins.
 * Das Protokoll ist unveränderlich; es gibt bewusst keine Schreib- oder Löschrouten.
 */
const express = require('express');
const { query } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const AuditService = require('../services/auditService');
const { sendServiceError } = require('../utils/serviceErrors');

const router = express.Router();

router.get('/',
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('userId').optional().isInt({ min: 1 }),
    query('from').optional().isISO8601({ strict: true }).withMessage('from muss ein Datum (YYYY-MM-DD) sein'),
    query('to').optional().isISO8601({ strict: true }).withMessage('to muss ein Datum (YYYY-MM-DD) sein'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { page, limit, userId, action, entityType, from, to } = req.query;
      const result = await AuditService.list({ page, limit, userId, action, entityType, from, to });
      res.json({ success: true, message: 'Änderungsprotokoll erfolgreich geladen', data: result });
    } catch (error) {
      sendServiceError(res, error, { status: 500, code: 'AUDIT_LOAD_ERROR', error: 'Änderungsprotokoll konnte nicht geladen werden' });
    }
  }
);

module.exports = router;
