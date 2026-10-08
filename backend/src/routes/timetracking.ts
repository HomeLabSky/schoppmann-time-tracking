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
import SpecialItemService from '../services/specialItemService';
import {
  CreateTimeEntryBody, UpdateTimeEntryBody, MonthQuery, MultiMonthQuery, MonthlyRecords, PeriodsData, EntryData, MultiMonthStats,
  CreateSpecialItemBody, UpdateSpecialItemBody, SpecialItemData
} from '../schemas/timeEntry';

const api = createApiRouter('/timetracking', { tags: ['Zeiterfassung'] });

const EntryIdParam = idParam('id', 'Eintrag-ID');
const SpecialItemIdParam = idParam('id', 'Sonderposten-ID');

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

// Sonderposten: eigene, privat verauslagte Beträge (erscheinen in GET /timetracking unter `specialItems`)
api.post('/special-items', {
  summary: 'Sonderposten erfassen (privat verauslagter Betrag)',
  description: 'Erscheint auf dem Lohnzettel und wird mit dem Lohn ausgezahlt; zählt wie der Verdienst gegen die ' +
    'Minijob-Grenze, der Rest geht in den Übertrag. Kaufdatum: nicht in der Zukunft, höchstens 1 Monat zurück (bzw. bis ' +
    'zur freigegebenen Nacherfassung). Liegt es in einer abgeschlossenen Periode, wird der Posten Nachtrag in der nächsten ' +
    'offenen (`billingDate`). Mit `clientId` sicher wiederholbar: Existiert bereits ein Posten mit dieser Kennung, kommt er mit 200 zurück.',
  tags: ['Sonderposten'],
  body: CreateSpecialItemBody,
  response: SpecialItemData,
  status: 201,
  message: 'Sonderposten erfasst',
  errors: ['VALIDATION_ERROR', 'PERIOD_CLOSED']
}, async (req) => {
  const { item, replayed } = SpecialItemService.create(req.user.userId, req.valid.body, actorOf(req));
  if (replayed) return { status: 200, message: 'Sonderposten bereits vorhanden', data: { item } };
  return item.billingDate ? { message: 'Sonderposten als Nachtrag erfasst', data: { item } } : { data: { item } };
});

api.put('/special-items/:id', {
  summary: 'Eigenen Sonderposten ändern',
  description: 'Gleiche Regeln wie beim Anlegen. Gesperrt, sobald die Periode abgeschlossen ist, in der er abgerechnet wird.',
  tags: ['Sonderposten'],
  params: SpecialItemIdParam,
  body: UpdateSpecialItemBody,
  response: SpecialItemData,
  message: 'Sonderposten geändert',
  errors: ['VALIDATION_ERROR', 'SPECIAL_ITEM_NOT_FOUND', 'PERIOD_CLOSED']
}, async (req) => ({ data: { item: SpecialItemService.update(req.user.userId, req.valid.params.id, req.valid.body, actorOf(req)) } }));

api.delete('/special-items/:id', {
  summary: 'Eigenen Sonderposten löschen',
  description: 'Gesperrt, sobald die Periode abgeschlossen ist, in der er abgerechnet wird. Bleibt im Änderungsprotokoll erhalten.',
  tags: ['Sonderposten'],
  params: SpecialItemIdParam,
  message: 'Sonderposten gelöscht',
  errors: ['SPECIAL_ITEM_NOT_FOUND', 'PERIOD_CLOSED']
}, async (req) => {
  SpecialItemService.delete(req.user.userId, req.valid.params.id, actorOf(req));
  return {};
});

export default api.router;
