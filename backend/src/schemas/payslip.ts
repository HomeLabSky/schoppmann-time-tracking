/** Schemas für Lohnzettel (PDF je abgeschlossener Abrechnungsperiode). */
import { z, timestamp } from './common';

const PayslipListItem = z.object({
  id: z.number().int().describe('Kennung des Abschlusses – für GET /employee/payslips/{id}/pdf'),
  label: z.string().describe('Benennung der Periode, z. B. "August 2026"'),
  periodStart: z.string(),
  periodEnd: z.string(),
  closedAt: timestamp(),
  totalHours: z.number(),
  earnings: z.number().describe('Verdienst der Periode in Euro'),
  paid: z.number().describe('Auszahlung in Euro'),
  carryOut: z.number().describe('Übertrag in die nächste Periode in Euro')
}).meta({ id: 'PayslipListItem', description: 'Lohnzettel einer abgeschlossenen Periode (Beträge festgeschrieben)' });

const PayslipListData = z.object({ payslips: z.array(PayslipListItem) });

export { PayslipListItem, PayslipListData };
