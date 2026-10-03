/**
 * Testhelfer: Datensätze direkt anlegen (ohne Fachregeln), damit Tests beliebige Ausgangslagen bauen können.
 */
import assert from 'node:assert/strict';
import { db } from '../src/db/client';
import { minijobSettings, timeEntries, users, type NewUser, type TimeEntryRow, type User } from '../src/db/schema';
import { hashPassword } from '../src/models/user';

let seq = 0;

/** Konto anlegen (Passwort 'Abcdef12', Stundenlohn 10 €, sofern nicht anders angegeben) */
export const makeUser = async (patch: Partial<NewUser> = {}, prefix = 'test'): Promise<User> =>
  db().insert(users).values({
    email: `${prefix}${++seq}@schoppmann.de`,
    name: 'Test Benutzer',
    stundenlohn: 10,
    ...patch,
    password: await hashPassword(patch.password ?? 'Abcdef12')
  }).returning().get();

/** Zeiteintrag direkt anlegen (eingefrorener Satz in Cent) */
export const addEntry = (
  user: { id: number },
  date: string,
  { start = '09:00', end = '17:00', breakMinutes = 0, rateCents = 1000 } = {}
): TimeEntryRow =>
  db().insert(timeEntries).values({
    userId: user.id,
    date,
    startTime: `${start}:00`,
    endTime: `${end}:00`,
    breakMinutes,
    hourlyRateCents: rateCents
  }).returning().get();

/** Minijob-Grenze direkt anlegen */
export const addLimit = (createdBy: number, monthlyLimit: number, validFrom: string, validUntil: string | null = null, description = 'Testgrenze') =>
  db().insert(minijobSettings).values({ monthlyLimit, description, validFrom, validUntil, createdBy }).returning().get();

export const actorOf = (user: { id: number; email: string }) => ({ id: user.id, email: user.email });

/** Fachfehler: Code (z. B. PERIOD_CLOSED) und Meldung gemeinsam prüfbar */
export const reject = (promise: Promise<unknown>, pattern: RegExp) =>
  assert.rejects(promise, (e: { code?: string; message?: string }) => pattern.test(`${e.code}: ${e.message}`));
