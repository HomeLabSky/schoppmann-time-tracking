/**
 * Änderungsprotokoll (/admin/audit) – nur lesend, nur für Admins.
 * Das Protokoll ist unveränderlich; es gibt bewusst keine Schreib- oder Löschrouten.
 */
import { createApiRouter } from '../lib/route';
import AuditService from '../services/auditService';
import { AuditQuery, AuditListData } from '../schemas/admin';

const api = createApiRouter('/admin/audit', { tags: ['Änderungsprotokoll'] });

api.get('/', {
  summary: 'Änderungsprotokoll durchsuchen (neueste zuerst)',
  auth: 'admin',
  query: AuditQuery,
  response: AuditListData,
  message: 'Änderungsprotokoll erfolgreich geladen'
}, async (req) => ({ data: await AuditService.list(req.valid.query) }));

export default api.router;
