/**
 * Zeiterfassung (/timetracking) – eigene Einträge des angemeldeten Mitarbeiters.
 *
 * Dünne Controller-Schicht über TimeEntryService. Alle Fachregeln (Zeitraum, Dauer, Pause, abgeschlossene
 * Perioden) prüft der Server – Web und App rechnen nichts selbst.
 */
const { createApiRouter } = require('../lib/route');
const { idParam } = require('../schemas/common');
const { actorOf } = require('../middleware/auth');
const TimeEntryService = require('../services/timeEntryService');
const {
  CreateTimeEntryBody, UpdateTimeEntryBody, MonthQuery, MultiMonthQuery, MonthlyRecords, PeriodsData, EntryData, MultiMonthStats
} = require('../schemas/timeEntry');

const api = createApiRouter('/timetracking', { tags: ['Zeiterfassung'] });

const EntryIdParam = idParam('id', 'Eintrag-ID');

api.get('/', {
  summary: 'Zeiteinträge und Abrechnung einer Periode',
  description: 'Liefert die Einträge der Abrechnungsperiode zum Referenzmonat, Summen, Minijob-Übertrag und den Abschluss-Status.',
  query: MonthQuery,
  response: MonthlyRecords,
  message: 'Zeiteinträge erfolgreich geladen'
}, async (req) => {
  const [year, month] = req.valid.query.month.split('-').map(Number);
  return { data: await TimeEntryService.getMonthlyTimeRecords(req.user.userId, year, month) };
});

api.get('/periods', {
  summary: 'Abrechnungsperioden zur Auswahl (12 zurück, 3 voraus)',
  response: PeriodsData,
  message: 'Abrechnungsperioden erfolgreich geladen'
}, async (req) => {
  const periods = await TimeEntryService.generateBillingPeriods(req.user.userId, 12, 3);
  return { data: { periods, currentPeriod: periods.find((p) => p.isCurrent) } };
});

// vor '/:id' registrieren, sonst greift die ID-Route
api.get('/stats/multi-month', {
  summary: 'Statistik über mehrere Monate',
  query: MultiMonthQuery,
  response: MultiMonthStats,
  message: 'Statistiken erfolgreich geladen'
}, async (req) => {
  const months = req.valid.query.months || 12;
  return { data: await TimeEntryService.getMultiMonthStats(req.user.userId, months) };
});

api.get('/:id', {
  summary: 'Einzelner Zeiteintrag',
  params: EntryIdParam,
  response: EntryData,
  message: 'Zeiteintrag erfolgreich geladen',
  errors: ['ENTRY_NOT_FOUND']
}, async (req) => {
  const entry = await TimeEntryService.getTimeEntry(req.valid.params.id, req.user.userId);
  return { data: { entry } };
});

api.post('/', {
  summary: 'Zeiteintrag anlegen',
  description: 'Regeln: nicht in der Zukunft, höchstens 1 Monat zurück, 15 min bis 12 h, Ende < Start = über Mitternacht. ' +
    'Mit `clientId` sicher wiederholbar: Existiert bereits ein Eintrag mit dieser Kennung, kommt er mit 200 zurück.',
  body: CreateTimeEntryBody,
  response: EntryData,
  status: 201,
  message: 'Zeiteintrag erfolgreich erstellt',
  errors: ['VALIDATION_ERROR', 'ENTRY_EXISTS', 'PERIOD_CLOSED', 'CLIENT_ID_CONFLICT']
}, async (req) => {
  const { entry, replayed } = await TimeEntryService.createTimeEntryIdempotent(
    { ...req.valid.body, userId: req.user.userId },
    actorOf(req)
  );
  return replayed
    ? { status: 200, message: 'Zeiteintrag bereits vorhanden', data: { entry } }
    : { data: { entry } };
});

api.put('/:id', {
  summary: 'Zeiteintrag ändern (Datum ist nicht änderbar)',
  params: EntryIdParam,
  body: UpdateTimeEntryBody,
  response: EntryData,
  message: 'Zeiteintrag erfolgreich aktualisiert',
  errors: ['ENTRY_NOT_FOUND', 'PERIOD_CLOSED']
}, async (req) => {
  const entry = await TimeEntryService.updateTimeEntry(req.valid.params.id, req.valid.body, req.user.userId, actorOf(req));
  return { data: { entry } };
});

api.delete('/:id', {
  summary: 'Zeiteintrag löschen',
  description: 'Der gelöschte Zustand bleibt im Änderungsprotokoll erhalten.',
  params: EntryIdParam,
  message: 'Zeiteintrag erfolgreich gelöscht',
  errors: ['ENTRY_NOT_FOUND', 'PERIOD_CLOSED']
}, async (req) => {
  await TimeEntryService.deleteTimeEntry(req.valid.params.id, req.user.userId, actorOf(req));
  return {};
});

module.exports = api.router;
