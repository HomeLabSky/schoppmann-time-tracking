/**
 * Gemeinsame Helfer für die Wartungs-Skripte (admin:create, user:reset-password).
 * Keine HTTP-Routen: Wartung läuft nur lokal auf dem Server, mit Zugriff auf die .env.
 */
const readline = require('readline');
const crypto = require('crypto');

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_HINT = 'mindestens 8 Zeichen, mit Groß-, Kleinbuchstaben und einer Zahl';

// Eine gemeinsame readline-Instanz für alle Fragen (sonst gehen bei gepipter
// Eingabe Zeilen zwischen zwei Instanzen verloren).
let rl = null;
let muted = false;
const lineQueue = []; // bereits eingegebene, noch nicht abgefragte Zeilen
let waiting = null; // Auflösefunktion der gerade wartenden Frage
const getInterface = () => {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (text) => {
      if (!muted || /[\r\n]/.test(text)) write(text);
    };
    rl.on('line', (line) => {
      if (waiting) {
        const resolve = waiting;
        waiting = null;
        resolve(line);
      } else {
        lineQueue.push(line);
      }
    });
  }
  return rl;
};

const closeCli = () => {
  if (rl) {
    rl.close();
    rl = null;
  }
};

/** Fragt eine Zeile ab; `hidden: true` zeigt die Eingabe nicht an (Passwörter). */
const ask = (question, { hidden = false, defaultValue = '' } = {}) =>
  new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    getInterface();
    process.stdout.write(`${question}${suffix}: `);
    const finish = (answer) => {
      muted = false;
      resolve(answer.trim() || defaultValue);
    };
    if (lineQueue.length > 0) {
      finish(lineQueue.shift());
    } else {
      muted = hidden; // erst nach der Eingabeaufforderung stummschalten
      waiting = finish;
    }
  });

/** Zufallspasswort, das die Passwortregel sicher erfüllt (ohne verwechselbare Zeichen). */
const generatePassword = (length = 16) => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/**
 * Liefert ein Passwort: bei --generate ein zufälliges (wird einmal ausgegeben),
 * sonst per verdeckter Eingabe mit Wiederholung.
 */
const obtainPassword = async (generate) => {
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

/** Startet DB-Verbindung/Tabellen und liefert die Models. */
const boot = async () => {
  const { initDatabase, User, sequelize } = require('../../models');
  await initDatabase();
  return { User, sequelize };
};

module.exports = { ask, closeCli, obtainPassword, boot, generatePassword, PASSWORD_RULE, PASSWORD_HINT };
