/**
 * Gemeinsame Helfer für die Wartungs-Skripte (admin:create, user:reset-password).
 * Keine HTTP-Routen: Wartung läuft nur lokal auf dem Server, mit Zugriff auf die .env.
 */
import crypto from 'node:crypto';
import readline from 'node:readline';
import { closeDb, initDatabase } from '../../db';

type MutableInterface = readline.Interface & { _writeToOutput: (text: string) => void };

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export const PASSWORD_HINT = 'mindestens 8 Zeichen, mit Groß-, Kleinbuchstaben und einer Zahl';

// Eine gemeinsame readline-Instanz für alle Fragen (sonst gehen bei gepipter
// Eingabe Zeilen zwischen zwei Instanzen verloren).
let rl: MutableInterface | null = null;
let muted = false;
const lineQueue: string[] = []; // bereits eingegebene, noch nicht abgefragte Zeilen
let waiting: ((line: string) => void) | null = null; // Auflösefunktion der gerade wartenden Frage
const getInterface = (): MutableInterface => {
  if (!rl) {
    const created = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true }) as MutableInterface;
    const write = created._writeToOutput.bind(created);
    created._writeToOutput = (text: string) => {
      if (!muted || /[\r\n]/.test(text)) write(text);
    };
    created.on('line', (line: string) => {
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve(line);
      } else {
        lineQueue.push(line);
      }
    });
    rl = created;
  }
  return rl;
};

export const closeCli = (): void => {
  if (rl) {
    rl.close();
    rl = null;
  }
};

/** Fragt eine Zeile ab; `hidden: true` zeigt die Eingabe nicht an (Passwörter). */
export const ask = (question: string, { hidden = false, defaultValue = '' } = {}): Promise<string> =>
  new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    getInterface();
    process.stdout.write(`${question}${suffix}: `);
    const finish = (answer: string) => {
      muted = false;
      resolve(answer.trim() || defaultValue);
    };
    if (lineQueue.length > 0) {
      finish(lineQueue.shift() as string);
    } else {
      muted = hidden; // erst nach der Eingabeaufforderung stummschalten
      waiting = finish;
    }
  });

/** Zufallspasswort, das die Passwortregel sicher erfüllt (ohne verwechselbare Zeichen). */
export const generatePassword = (length = 16): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set: string): string => set[crypto.randomInt(set.length)] as string;
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
};

/**
 * Liefert ein Passwort: bei --generate ein zufälliges (wird einmal ausgegeben),
 * sonst per verdeckter Eingabe mit Wiederholung.
 */
export const obtainPassword = async (generate: boolean): Promise<{ password: string; generated: boolean }> => {
  if (generate) {
    return { password: generatePassword(), generated: true };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const first = await ask('Neues Passwort', { hidden: true });
    if (!PASSWORD_RULE.test(first)) {
      console.log(`❌ Passwort zu schwach: ${PASSWORD_HINT}.`);
      continue;
    }
    const second = await ask('Passwort wiederholen', { hidden: true });
    if (first !== second) {
      console.log('❌ Die Eingaben stimmen nicht überein.');
      continue;
    }
    return { password: first, generated: false };
  }
  throw new Error('Kein gültiges Passwort eingegeben.');
};

/** Öffnet die Datenbank und wendet ausstehende Migrationen an. */
export const boot = async (): Promise<void> => {
  await initDatabase();
};

/** Datenbank schließen (am Ende jedes Skripts) */
export const shutdown = async (): Promise<void> => {
  closeCli();
  closeDb();
};
