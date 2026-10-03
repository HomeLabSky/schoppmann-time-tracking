/**
 * Änderungsprotokoll (/admin/audit) – nur lesend, nur für Admins.
 * Das Protokoll ist unveränderlich; es gibt bewusst keine Schreib- oder Löschrouten.
 */
const { createApiRouter } = require('../lib/route');
const AuditService = require('../services/auditService');
const { AuditQuery, AuditListData } = require('../schemas/admin');

const api = createApiRouter('/admin/audit', { tags: ['Änderungsprotokoll'] });

api.get('/', {
  summary: 'Änderungsprotokoll durchsuchen (neueste zuerst)',
  auth: 'admin',
  query: AuditQuery,
  response: AuditListData,
  message: 'Änderungsprotokoll erfolgreich geladen'
}, async (req) => ({ data: await AuditService.list(req.valid.query) }));

module.exports = api.router;
