/**
 * Zeitnachweise und Monatsabschluss (/admin/timesheets) – nur für Admins.
 *
 * Admins sehen die Zeiten aller Mitarbeiter und schließen Abrechnungsperioden ab bzw. öffnen sie (mit
 * Begründung) wieder. Dünne Controller-Schicht über TimeEntryService und PeriodService; jede Änderung
 * landet im Änderungsprotokoll.
 */
const { createApiRouter } = require('../lib/route');
const TimeEntryService = require('../services/timeEntryService');
const PeriodService = require('../services/periodService');
const { actorOf } = require('../middleware/auth');
const { MonthQuery, MonthlyRecords, PeriodsData } = require('../schemas/timeEntry');
const { UserIdParam, ClosePeriodBody, ReopenPeriodBody, ClosureData, ReopenData } = require('../schemas/admin');

const api = createApiRouter('/admin/timesheets', { tags: ['Zeitnachweise'] });

const parseMonth = (month) => month.split('-').map(Number);

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
  description: 'Erst nach Periodenende; frühere Perioden mit Einträgen müssen abgeschlossen sein; eine Minijob-Grenze muss hinterlegt sein.',
  auth: 'admin',
  params: UserIdParam,
  body: ClosePeriodBody,
  response: ClosureData,
  status: 201,
  message: 'Periode erfolgreich abgeschlossen',
  errors: ['USER_NOT_FOUND', 'PERIOD_NOT_ENDED', 'PERIOD_ALREADY_CLOSED', 'PERIOD_OVERLAP', 'PERIOD_PREVIOUS_OPEN', 'MINIJOB_LIMIT_MISSING']
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

module.exports = api.router;
