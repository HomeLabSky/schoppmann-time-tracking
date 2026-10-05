import assert from 'node:assert/strict';
import test from 'node:test';
import * as billing from '../src/utils/billing';

test('workMinutes: normale Schicht, Pause, Nachtschicht', () => {
  const cases: [string, string, number, number][] = [
    ['09:00', '17:00', 0, 480],
    ['09:00:00', '17:00:00', 30, 450],
    ['22:00', '06:00', 0, 480], // über Mitternacht
    ['22:00', '06:00', 60, 420],
    ['08:00', '08:10', 30, 0], // Pause länger als Arbeit → nie negativ
  ];
  for (const [start, end, pause, expected] of cases) {
    assert.equal(billing.workMinutes(start, end, pause), expected, `${start}-${end} Pause ${pause}`);
  }
});

test('earningsCents: kaufmännisch auf ganze Cent gerundet', () => {
  const cases = [
    [480, 1200, 9600], // 8 h × 12 €
    [450, 1200, 9000],
    [1, 1200, 20], // 1 min = 0,20 €
    [20, 1250, 417], // 4,1666… € → 4,17 €
    [0, 1200, 0],
  ];
  for (const [minutes, rate, expected] of cases) {
    assert.equal(billing.earningsCents(minutes, rate), expected, `${minutes} min @ ${rate}`);
  }
});

test('Cent-Summen driften nicht (0,1 + 0,2 = 0,3)', () => {
  assert.equal(billing.toCents('0.10') + billing.toCents(0.2), billing.toCents(0.3));
  assert.equal(billing.toEuros(billing.toCents('538.00')), 538);
});

test('resolveBreakMinutes: ausdrückliches 0 bleibt 0 (Regression: früher 0 || 30)', () => {
  assert.equal(billing.resolveBreakMinutes(0), 0);
  assert.equal(billing.resolveBreakMinutes('0'), 0);
  assert.equal(billing.resolveBreakMinutes(45), 45);
  assert.equal(billing.resolveBreakMinutes(undefined), 30);
  assert.equal(billing.resolveBreakMinutes(null), 30);
});

test('addMonths kürzt den Tag in kurzen Monaten', () => {
  assert.equal(billing.addMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(billing.addMonths('2025-03-31', -1), '2025-02-28');
  assert.equal(billing.addMonths('2026-01-15', -1), '2025-12-15');
});

test('validateEntryRules', () => {
  const today = '2026-10-02';
  const ok = { date: today, startTime: '09:00', endTime: '17:00', breakMinutes: 0 };
  const rules = (patch: Partial<billing.EntryTimes>, ctx: { today: string; checkDateWindow?: boolean } = { today, checkDateWindow: true }) =>
    billing.validateEntryRules({ ...ok, ...patch }, ctx);

  assert.deepEqual(rules({}), []);
  assert.deepEqual(rules({ date: '2026-09-02' }), [], 'genau ein Monat zurück ist erlaubt');
  assert.match(rules({ date: '2026-09-01' })[0], /einen Monat/);
  assert.match(rules({ date: '2026-10-03' })[0], /Zukunft/);
  assert.match(rules({ startTime: '08:00', endTime: '08:00' })[0], /nicht gleich/);
  assert.match(rules({ startTime: '08:00', endTime: '08:10' })[0], /15 Minuten/);
  assert.match(rules({ startTime: '06:00', endTime: '18:30' })[0], /12 Stunden/);
  assert.deepEqual(rules({ startTime: '22:00', endTime: '06:00' }), [], 'Nachtschicht erlaubt');
  assert.match(rules({ breakMinutes: 600 }).join(), /Pausendauer/);
  // Datumsfenster nur bei checkDateWindow (nicht beim Bearbeiten alter Einträge)
  assert.deepEqual(rules({ date: '2020-01-01' }, { today }), []);
});

test('limitCentsForDate: nimmt die zum Stichtag gültige Grenze', () => {
  const settings = [
    { monthlyLimit: '538.00', validFrom: '2024-01-01', validUntil: '2024-12-31' },
    { monthlyLimit: '556.00', validFrom: '2025-01-01', validUntil: '2025-12-31' },
    { monthlyLimit: '603.00', validFrom: '2026-01-01', validUntil: null },
  ];
  const cases: [string, number][] = [
    ['2024-06-30', 53800],
    ['2024-12-31', 53800],
    ['2025-01-01', 55600],
    ['2026-10-02', 60300],
    ['2030-01-01', 60300], // offen nach oben
    ['2023-06-01', billing.DEFAULT_LIMIT_CENTS], // vor der ersten Einstellung → Fallback
  ];
  for (const [date, expected] of cases) {
    assert.equal(billing.limitCentsForDate(settings, date), expected, date);
  }
  assert.equal(billing.limitCentsForDate([], '2026-01-01'), billing.DEFAULT_LIMIT_CENTS);
});

test('hasLimitForDate: erkennt Zeiträume ohne hinterlegte Grenze', () => {
  const settings = [{ monthlyLimit: '603.00', validFrom: '2026-01-01', validUntil: null }];
  assert.equal(billing.hasLimitForDate(settings, '2026-10-02'), true);
  assert.equal(billing.hasLimitForDate(settings, '2025-12-31'), false);
  assert.equal(billing.hasLimitForDate([], '2026-10-02'), false);
});

test('foldCarry: Übertrag über mehrere Perioden', () => {
  const rows = billing.foldCarry([
    { earningsCents: 40000, limitCents: 50000 }, // unter Limit
    { earningsCents: 70000, limitCents: 50000 }, // 200 € Überhang
    { earningsCents: 10000, limitCents: 50000 }, // Übertrag 200 + 100 = 300 → bezahlt, kein Rest
    { earningsCents: 90000, limitCents: 50000 }, // 400 € Überhang
    { earningsCents: 0, limitCents: 50000 }, // Übertrag wird abgebaut
  ]);
  const pick = (r) => [r.carryInCents, r.actualCents, r.paidCents, r.carryOutCents];
  assert.deepEqual(pick(rows[0]), [0, 40000, 40000, 0]);
  assert.deepEqual(pick(rows[1]), [0, 70000, 50000, 20000]);
  assert.deepEqual(pick(rows[2]), [20000, 30000, 30000, 0]);
  assert.deepEqual(pick(rows[3]), [0, 90000, 50000, 40000]);
  assert.deepEqual(pick(rows[4]), [40000, 40000, 40000, 0]);
});

test('foldCarry: Grenze ändert sich zwischen Perioden', () => {
  const rows = billing.foldCarry([
    { earningsCents: 60000, limitCents: 53800 }, // 2024
    { earningsCents: 0, limitCents: 55600 }, // 2025: Übertrag 6200 wird ausgezahlt
  ]);
  assert.equal(rows[0].carryOutCents, 6200);
  assert.equal(rows[1].paidCents, 6200);
  assert.equal(rows[1].carryOutCents, 0);
});

test('addDays: über Monats- und Jahresgrenzen, Schaltjahr', () => {
  assert.equal(billing.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(billing.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(billing.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(billing.addDays('2026-03-29', 1), '2026-03-30', 'Zeitumstellung ohne Einfluss');
});

test('findOverlap: Überschneidung auf durchgehender Zeitachse, anschließend erlaubt, eigener Eintrag ausgenommen', () => {
  const day = (id: number, date: string, startTime: string, endTime: string) => ({ id, date, startTime, endTime, breakMinutes: 0 });
  const existing = [day(1, '2024-06-03', '08:00', '12:00'), day(2, '2024-06-03', '22:00', '02:00')];
  const check = (date: string, start: string, end: string, id?: number) =>
    billing.findOverlap({ id, date, startTime: start, endTime: end, breakMinutes: 0 }, existing)?.id ?? null;

  assert.equal(check('2024-06-03', '12:00', '13:00'), null, 'beginnt, wo der andere endet');
  assert.equal(check('2024-06-03', '07:00', '08:00'), null, 'endet, wo der andere beginnt');
  assert.equal(check('2024-06-03', '11:00', '13:00'), 1);
  assert.equal(check('2024-06-03', '06:00', '14:00'), 1, 'umschließt');
  assert.equal(check('2024-06-04', '01:00', '03:00'), 2, 'Nachtschicht vom Vortag');
  assert.equal(check('2024-06-04', '02:00', '03:00'), null);
  assert.equal(check('2024-06-02', '23:00', '08:30'), 1, 'Nachtschicht in den Folgetag');
  assert.equal(check('2024-06-03', '08:00', '12:00', 1), null, 'bearbeiteter Eintrag zählt nicht gegen sich selbst');
});

test('validateDayRules: Summe der Arbeitszeit je Tag höchstens 12 Stunden', () => {
  const e = (date: string, startTime: string, endTime: string, breakMinutes = 0, id?: number) => ({ id, date, startTime, endTime, breakMinutes });
  const sameDay = [e('2024-06-03', '06:00', '14:00', 0, 1), e('2024-06-02', '06:00', '18:00', 0, 2)];
  assert.deepEqual(billing.validateDayRules(e('2024-06-03', '15:00', '19:00'), sameDay), [], 'genau 12 h');
  assert.match(billing.validateDayRules(e('2024-06-03', '15:00', '19:01'), sameDay)[0] ?? '', /12 Stunden.*8:00 Std/);
  assert.deepEqual(billing.validateDayRules(e('2024-06-03', '15:00', '19:30', 30), sameDay), [], 'Pause zählt nicht');
  assert.deepEqual(billing.validateDayRules(e('2024-06-03', '06:00', '18:00', 0, 1), sameDay), [], 'eigener Eintrag ersetzt');
});
