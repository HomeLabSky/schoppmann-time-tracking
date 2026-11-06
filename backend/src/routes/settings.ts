/**
 * Einstellungen der Anwendung (/admin/settings) – nur für Admins.
 *
 * Derzeit: Empfänger und Text für den Versand der Lohnabrechnung per E-Mail. Der Mailserver selbst steht in der Umgebung
 * (SMTP_*), damit keine Zugangsdaten in der Datenbank oder der Oberfläche landen. Jede Änderung steht im Änderungsprotokoll.
 */
import { createApiRouter } from '../lib/route';
import PayrollMailService from '../services/payrollMailService';
import { actorOf } from '../middleware/auth';
import { PayrollMailInfoData, PayrollMailSettingsBody } from '../schemas/payrollMail';

const api = createApiRouter('/admin/settings', { tags: ['Einstellungen'] });

api.get('/payroll-mail', {
  summary: 'Versand der Lohnabrechnung: Empfänger, Text und Mailserver-Status',
  auth: 'admin',
  response: PayrollMailInfoData,
  message: 'Einstellungen geladen'
}, () => ({ data: PayrollMailService.getInfo() }));

api.put('/payroll-mail', {
  summary: 'Versand der Lohnabrechnung: Empfänger und Text speichern',
  description: 'Platzhalter in Betreff und Text: {monat} (z. B. „Oktober 2026“) und {anzahl} (Zahl der Lohnzettel). ' +
    'Leerer Empfänger schaltet den Versand aus.',
  auth: 'admin',
  body: PayrollMailSettingsBody,
  response: PayrollMailInfoData,
  message: 'Einstellungen gespeichert'
}, (req) => ({ data: PayrollMailService.updateSettings(req.valid.body, actorOf(req)) }));

export default api.router;
