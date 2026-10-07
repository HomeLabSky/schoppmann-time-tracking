import { z, integer, isoDate, month, clockTime, timestamp } from './common';

const breakMinutes = integer('Pausendauer', { min: 0, max: 480 })
  .optional()
  .nullable()
  .describe('Pause in Minuten. Ohne Angabe gilt der Standard: 30 für den ersten Eintrag des Tages, 0 für weitere ' +
    '(die Pause liegt dann zwischen den Einträgen). 0 heißt ausdrücklich keine Pause.');

const description = z.string().trim().max(500, 'Beschreibung darf maximal 500 Zeichen haben').optional().nullable();

const CreateTimeEntryBody = z.object({
  date: isoDate(),
  startTime: clockTime('Startzeit'),
  endTime: clockTime('Endzeit').describe('Endzeit (HH:mm); kleiner als Start = über Mitternacht'),
  breakMinutes,
  description,
  clientId: z.string().trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, 'clientId muss 8–64 Zeichen aus Buchstaben, Ziffern, - und _ haben (z. B. UUID)')
    .optional()
    .describe('Vom Client erzeugte Kennung (z. B. UUID) für sichere Wiederholung bei Offline-Erfassung')
});

// Datum ist nicht änderbar; nur übermittelte Felder werden geändert
const UpdateTimeEntryBody = z.object({
  startTime: clockTime('Startzeit').optional(),
  endTime: clockTime('Endzeit').optional(),
  breakMinutes,
  description
});

const MonthQuery = z.object({ month: month() });

const MultiMonthQuery = z.object({
  months: integer('Monate', { min: 1, max: 24 }).optional()
});

const TimeEntry = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  clientId: z.string().nullable().optional(),
  date: z.string().describe('Arbeitstag (YYYY-MM-DD)'),
  startTime: z.string().describe('HH:mm'),
  endTime: z.string().describe('HH:mm'),
  breakMinutes: z.number().int(),
  description: z.string().nullable(),
  hourlyRateCents: z.number().int().nullable().describe('Beim Anlegen eingefrorener Stundensatz in Cent'),
  hourlyRate: z.number().describe('Eingefrorener Stundensatz in Euro'),
  workMinutes: z.number().int(),
  workTime: z.string().describe('Arbeitszeit als HH:mm'),
  totalHours: z.number(),
  earningsCents: z.number().int(),
  earnings: z.number().describe('Verdienst in Euro'),
  formattedEarnings: z.string(),
  createdAt: timestamp(),
  updatedAt: timestamp()
}).meta({ id: 'TimeEntry', description: 'Zeiteintrag; Beträge aus dem eingefrorenen Stundensatz' });

const Period = z.object({
  value: z.string().describe('Referenzmonat (YYYY-MM) – für ?month= verwenden'),
  label: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  monthName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  referenceMonth: z.number().int().optional(),
  referenceYear: z.number().int().optional(),
  isCurrent: z.boolean(),
  isClosed: z.boolean().optional()
}).meta({ id: 'BillingPeriod', description: 'Abrechnungsperiode eines Mitarbeiters' });

const Summary = z.object({
  totalHours: z.number(),
  totalEarnings: z.number().describe('Verdienst der Periode in Euro'),
  actualEarnings: z.number().describe('Verdienst + Übertrag aus Vorperioden'),
  carryIn: z.number(),
  carryOut: z.number().describe('Übertrag in die nächste Periode (über der Grenze)'),
  paidThisMonth: z.number().describe('Auszahlung dieser Periode (höchstens die Grenze)'),
  minijobLimit: z.number(),
  hourlyRate: z.number(),
  exceedsLimit: z.boolean(),
  minijobLimitMissing: z.boolean().describe('Keine Minijob-Grenze hinterlegt: Werte vorläufig, Abschluss gesperrt'),
  entryCount: z.number().int(),
  workDays: z.number().int().describe('Anzahl Tage mit Einträgen (mehrere Einträge pro Tag möglich)')
}).meta({ id: 'PeriodSummary' });

const MonthlyRecords = z.object({
  records: z.array(TimeEntry),
  summary: Summary,
  period: z.object({
    year: z.number().int(),
    month: z.number().int(),
    monthName: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    description: z.string(),
    status: z.enum(['open', 'closed'])
  }),
  closure: z.object({
    id: z.number().int().describe('Kennung des Abschlusses (Lohnzettel: GET /employee/payslips/{id}/pdf)'),
    closedAt: z.union([z.string(), z.date()]),
    closedBy: z.number().int().nullable(),
    periodStart: z.string(),
    periodEnd: z.string()
  }).nullable()
}).meta({ id: 'MonthlyRecords', description: 'Zeiteinträge und Abrechnung einer Periode' });

const PeriodsData = z.object({
  periods: z.array(Period),
  currentPeriod: Period.optional()
});

const EntryData = z.object({ entry: TimeEntry });

const MultiMonthStats = z.object({
  monthlyStats: z.array(Summary.extend({
    year: z.number().int(),
    month: z.number().int(),
    monthName: z.string()
  })),
  totalStats: z.object({
    totalHours: z.number(),
    totalEarnings: z.number(),
    averageMonthlyHours: z.number()
  })
});

export {
  CreateTimeEntryBody,
  UpdateTimeEntryBody,
  MonthQuery,
  MultiMonthQuery,
  TimeEntry,
  Period,
  MonthlyRecords,
  PeriodsData,
  EntryData,
  MultiMonthStats
};
