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
import { actorOf } from '../middleware/auth';
import { MonthQuery, MonthlyRecords, PeriodsData } from '../schemas/timeEntry';
import { UserIdParam, ClosePeriodBody, ReopenPeriodBody, ClosureData, ReopenData } from '../schemas/admin';

const api = createApiRouter('/admin/timesheets', { tags: ['Zeitnachweise'] });

const parseMonth = (month: string): [number, number] => {
  const [year = 0, monthNumber = 0] = month.split('-').map(Number);
  return [year, monthNumber];
};

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

export default api.router;
