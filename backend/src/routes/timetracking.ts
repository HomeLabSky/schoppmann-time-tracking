/**
 * Zeiterfassung (/timetracking) – eigene Einträge des angemeldeten Mitarbeiters.
 *
 * Dünne Controller-Schicht über TimeEntryService. Alle Fachregeln (Zeitraum, Dauer, Pause, abgeschlossene
 * Perioden) prüft der Server – Web und App rechnen nichts selbst.
 */
import { createApiRouter } from '../lib/route';
import { idParam } from '../schemas/common';
import { actorOf } from '../middleware/auth';
import TimeEntryService from '../services/timeEntryService';
import {
  CreateTimeEntryBody, UpdateTimeEntryBody, MonthQuery, MultiMonthQuery, MonthlyRecords, PeriodsData, EntryData, MultiMonthStats
} from '../schemas/timeEntry';

const api = createApiRouter('/timetracking', { tags: ['Zeiterfassung'] });

const EntryIdParam = idParam('id', 'Eintrag-ID');

api.get('/', {
  summary: 'Zeiteinträge und Abrechnung einer Periode',
  description: 'Liefert die Einträge der Abrechnungsperiode zum Referenzmonat, Summen, Minijob-Übertrag und den Abschluss-Status.',
  query: MonthQuery,
  response: MonthlyRecords,
  message: 'Zeiteinträge erfolgreich geladen'
}, async (req) => {
  const [year = 0, month = 0] = req.valid.query.month.split('-').map(Number);
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
    'Mehrere Einträge pro Tag sind erlaubt, solange sie sich nicht überschneiden (auch nicht mit einer Nachtschicht ' +
    'vom Vortag; direkt anschließend ist erlaubt → sonst 409 ENTRY_OVERLAP) und die Arbeitszeit des Tages 12 h nicht ' +
    'übersteigt. Mit `clientId` sicher wiederholbar: Existiert bereits ein Eintrag mit dieser Kennung, kommt er mit 200 zurück. ' +
    'Liegt der Tag in einer bereits abgeschlossenen Periode, wird der Eintrag als Nachtrag angelegt: Er behält sein Datum, ' +
    'abgerechnet wird er in der nächsten offenen Periode (`billingDate` = deren Beginn).',
  body: CreateTimeEntryBody,
  response: EntryData,
  status: 201,
  message: 'Zeiteintrag erfolgreich erstellt',
  errors: ['VALIDATION_ERROR', 'ENTRY_OVERLAP', 'PERIOD_CLOSED', 'CLIENT_ID_CONFLICT']
}, async (req) => {
  const { entry, replayed } = await TimeEntryService.createTimeEntryIdempotent(
    { ...req.valid.body, userId: req.user.userId },
    actorOf(req)
  );
  if (replayed) return { status: 200, message: 'Zeiteintrag bereits vorhanden', data: { entry } };
  return entry.billingDate ? { message: 'Zeiteintrag als Nachtrag erfasst', data: { entry } } : { data: { entry } };
});

api.put('/:id', {
  summary: 'Zeiteintrag ändern (Datum ist nicht änderbar)',
  description: 'Gleiche Regeln wie beim Anlegen, auch Überschneidung (ENTRY_OVERLAP) und 12 h je Tag. Gesperrt, sobald die ' +
    'Periode abgeschlossen ist, in der der Eintrag abgerechnet wird (bei Nachträgen die von `billingDate`).',
  params: EntryIdParam,
  body: UpdateTimeEntryBody,
  response: EntryData,
  message: 'Zeiteintrag erfolgreich aktualisiert',
  errors: ['VALIDATION_ERROR', 'ENTRY_NOT_FOUND', 'ENTRY_OVERLAP', 'PERIOD_CLOSED']
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

export default api.router;
