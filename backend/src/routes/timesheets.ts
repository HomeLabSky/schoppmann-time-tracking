/**
 * Zeitnachweise und Monatsabschluss (/admin/timesheets) – nur für Admins.
 *
 * Admins sehen die Zeiten aller Mitarbeiter und schließen Abrechnungsperioden ab bzw. öffnen sie (mit
 * Begründung) wieder. Dünne Controller-Schicht über TimeEntryService und PeriodService; jede Änderung
 * landet im Änderungsprotokoll.
 */
import { createApiRouter } from '../lib/route';
import TimeEntryService from '../services/timeEntryService';
import PeriodService from '../services/periodService';
import PayslipService from '../services/payslipService';
import SpecialItemService from '../services/specialItemService';
import config from '../config';
import { payslipFilename, renderPayslipsPdf } from '../utils/payslipPdf';
import { actorOf } from '../middleware/auth';
import { MonthQuery, MonthlyRecords, PeriodsData, CreateSpecialItemBody, UpdateSpecialItemBody, SpecialItemData } from '../schemas/timeEntry';
import { integer } from '../schemas/common';
import { UserIdParam, ClosePeriodBody, ReopenPeriodBody, ClosureData, ReopenData, TimesheetOverviewData } from '../schemas/admin';

const api = createApiRouter('/admin/timesheets', { tags: ['Zeitnachweise'] });

const parseMonth = (month: string): [number, number] => {
  const [year = 0, monthNumber = 0] = month.split('-').map(Number);
  return [year, monthNumber];
};

// Vor '/:userId' registrieren, sonst werden "overview" und "payslips" als Benutzer-ID gelesen
api.get('/overview', {
  summary: 'Monatsübersicht aller Mitarbeiter',
  description: 'Je Mitarbeiter Stunden, Beträge und Status in dessen eigener Abrechnungsperiode zum Referenzmonat. ' +
    'Deaktivierte Konten erscheinen nur mit Einträgen in der Periode. `billable: false` = weder Einträge noch Übertrag, ' +
    'nichts abzuschließen (die Oberfläche blendet solche Zeilen aus).',
  auth: 'admin',
  query: MonthQuery,
  response: TimesheetOverviewData,
  message: 'Übersicht erfolgreich geladen'
}, async (req) => {
  const [year, month] = parseMonth(req.valid.query.month);
  return { data: { month: req.valid.query.month, rows: PeriodService.overview(year, month) } };
});

api.get('/payslips', {
  summary: 'Monatsabschluss: alle Lohnzettel als eine PDF-Datei',
  description: 'Je Mitarbeiter mit abgeschlossener Periode zum Referenzmonat ein Lohnzettel, jeder ab einer neuen Seite ' +
    '(nach Namen sortiert). Mitarbeiter mit noch offener Periode fehlen. Keine abgeschlossene Periode → 404 PAYSLIP_NOT_FOUND.',
  auth: 'admin',
  tags: ['Lohnzettel'],
  query: MonthQuery,
  produces: 'application/pdf',
  message: 'Lohnzettel aller Mitarbeiter als PDF',
  errors: ['PAYSLIP_NOT_FOUND']
}, async (req) => {
  const [year, month] = parseMonth(req.valid.query.month);
  const payslips = PayslipService.allForMonth(year, month);
  const body = await renderPayslipsPdf(payslips, { companyAddress: config.payslip.companyAddress });
  return { file: { body, filename: payslipFilename(req.valid.query.month), contentType: 'application/pdf' } };
});

api.get('/:userId/payslip', {
  summary: 'Lohnzettel eines Mitarbeiters als PDF',
  description: 'Nur für eine abgeschlossene Periode (sonst 404 PAYSLIP_NOT_FOUND).',
  auth: 'admin',
  tags: ['Lohnzettel'],
  params: UserIdParam,
  query: MonthQuery,
  produces: 'application/pdf',
  message: 'Lohnzettel als PDF',
  errors: ['USER_NOT_FOUND', 'PAYSLIP_NOT_FOUND']
}, async (req) => {
  const [year, month] = parseMonth(req.valid.query.month);
  const payslip = PayslipService.forMonth(req.valid.params.userId, year, month);
  const body = await renderPayslipsPdf([payslip], { companyAddress: config.payslip.companyAddress });
  return { file: { body, filename: payslipFilename(payslip.period.endDate, payslip.employee.name), contentType: 'application/pdf' } };
});

api.get('/:userId/periods', {
  summary: 'Abrechnungsperioden eines Mitarbeiters (mit Abschluss-Kennzeichen)',
  auth: 'admin',
  params: UserIdParam,
  response: PeriodsData,
  message: 'Abrechnungsperioden erfolgreich geladen'
}, async (req) => {
  const periods = await TimeEntryService.generateBillingPeriods(req.valid.params.userId, 12, 1);
  return { data: { periods, currentPeriod: periods.find((p) => p.isCurrent) } };
});

api.get('/:userId', {
  summary: 'Zeitnachweis eines Mitarbeiters für eine Periode',
  auth: 'admin',
  params: UserIdParam,
  query: MonthQuery,
  response: MonthlyRecords,
  message: 'Zeitnachweis erfolgreich geladen',
  errors: ['USER_NOT_FOUND']
}, async (req) => {
  const [year, month] = parseMonth(req.valid.query.month);
  return { data: await TimeEntryService.getMonthlyTimeRecords(req.valid.params.userId, year, month) };
});

api.post('/:userId/close', {
  summary: 'Periode abschließen (Zahlen werden eingefroren)',
  description: 'Möglich, sobald die Periode begonnen hat – auch vor ihrem Ende (vorzeitiger Abschluss; spätere Einträge ' +
    'für die Periode werden Nachträge in der nächsten offenen Periode). Frühere Perioden mit Einträgen müssen ' +
    'abgeschlossen sein; eine Minijob-Grenze muss hinterlegt sein. Ohne Einträge und ohne Übertrag gibt es nichts ' +
    'abzuschließen (PERIOD_EMPTY).',
  auth: 'admin',
  params: UserIdParam,
  body: ClosePeriodBody,
  response: ClosureData,
  status: 201,
  message: 'Periode erfolgreich abgeschlossen',
  errors: ['USER_NOT_FOUND', 'PERIOD_NOT_STARTED', 'PERIOD_EMPTY', 'PERIOD_ALREADY_CLOSED', 'PERIOD_OVERLAP', 'PERIOD_PREVIOUS_OPEN', 'MINIJOB_LIMIT_MISSING']
}, async (req) => {
  const [year, month] = parseMonth(req.valid.body.month);
  const closure = await PeriodService.closePeriod(req.valid.params.userId, year, month, actorOf(req));
  return { data: { closure } };
});

api.post('/:userId/reopen', {
  summary: 'Abgeschlossene Periode wieder öffnen (Begründung Pflicht)',
  description: 'Nur die jüngste abgeschlossene Periode; die Begründung steht im Änderungsprotokoll.',
  auth: 'admin',
  params: UserIdParam,
  body: ReopenPeriodBody,
  response: ReopenData,
  message: 'Periode wieder geöffnet',
  errors: ['USER_NOT_FOUND', 'PERIOD_NOT_CLOSED', 'PERIOD_LATER_CLOSED', 'REASON_REQUIRED']
}, async (req) => {
  const [year, month] = parseMonth(req.valid.body.month);
  const result = await PeriodService.reopenPeriod(req.valid.params.userId, year, month, req.valid.body.reason, actorOf(req));
  return { data: result };
});

const SpecialItemParams = UserIdParam.extend({ itemId: integer('Sonderposten-ID', { min: 1 }) });

api.post('/:userId/special-items', {
  summary: 'Sonderposten erfassen (privat verauslagter Betrag)',
  description: 'Privat verauslagter Betrag des Mitarbeiters; erscheint auf dem Lohnzettel und wird mit dem Lohn ' +
    'ausgezahlt. Zählt wie der Verdienst gegen die Minijob-Grenze, der Rest geht in den Übertrag. Zugeordnet nach Kaufdatum; liegt es in einer ' +
    'abgeschlossenen Periode, wird der Posten Nachtrag in der nächsten offenen Periode (`billingDate`).',
  auth: 'admin',
  tags: ['Sonderposten'],
  params: UserIdParam,
  body: CreateSpecialItemBody,
  response: SpecialItemData,
  status: 201,
  message: 'Sonderposten erfasst',
  errors: ['USER_NOT_FOUND', 'PERIOD_CLOSED']
}, async (req) => ({ data: { item: SpecialItemService.create(req.valid.params.userId, req.valid.body, actorOf(req)) } }));

api.put('/:userId/special-items/:itemId', {
  summary: 'Sonderposten ändern',
  description: 'Nur solange die Periode, in der er abgerechnet wird, offen ist (sonst PERIOD_CLOSED).',
  auth: 'admin',
  tags: ['Sonderposten'],
  params: SpecialItemParams,
  body: UpdateSpecialItemBody,
  response: SpecialItemData,
  message: 'Sonderposten geändert',
  errors: ['SPECIAL_ITEM_NOT_FOUND', 'PERIOD_CLOSED']
}, async (req) => {
  const { userId, itemId } = req.valid.params;
  return { data: { item: SpecialItemService.update(userId, itemId, req.valid.body, actorOf(req)) } };
});

api.delete('/:userId/special-items/:itemId', {
  summary: 'Sonderposten löschen',
  description: 'Nur solange die Periode, in der er abgerechnet wird, offen ist (sonst PERIOD_CLOSED).',
  auth: 'admin',
  tags: ['Sonderposten'],
  params: SpecialItemParams,
  message: 'Sonderposten gelöscht',
  errors: ['SPECIAL_ITEM_NOT_FOUND', 'PERIOD_CLOSED']
}, async (req) => {
  SpecialItemService.delete(req.valid.params.userId, req.valid.params.itemId, actorOf(req));
  return {};
});

export default api.router;
