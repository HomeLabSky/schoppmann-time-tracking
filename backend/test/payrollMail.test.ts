/**
 * Lohnabrechnung per E-Mail: Einstellungen, Bereitschaft (alle Perioden abgeschlossen) und Versand mit PDF-Anhang.
 */
import './env/unit-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transporter } from 'nodemailer';
import { closeDb, initDatabase } from '../src/db';
import type { User } from '../src/db/schema';
import { AuditService } from '../src/services/auditService';
import { PeriodService } from '../src/services/periodService';
import {
  DEFAULT_BODY, DEFAULT_SUBJECT, PayrollMailService, fillTemplate, monthLabel, setMailTransportForTests
} from '../src/services/payrollMailService';
import { actorOf, addEntry, addLimit, makeUser } from './helpers';

interface SentMail {
  from?: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
}

const sent: SentMail[] = [];
let failNext: Error | null = null;
const fakeTransport = {
  sendMail: async (mail: SentMail) => {
    if (failNext) {
      const error = failNext;
      failNext = null;
      throw error;
    }
    sent.push(mail);
    return { messageId: 'test' };
  }
} as unknown as Transporter;

let admin: User;

test.before(async () => {
  await initDatabase();
  admin = await makeUser({ role: 'admin', name: 'Ada Admin' }, 'mail');
  addLimit(admin.id, 1000, '2024-01-01', null);
});

test.after(() => {
  setMailTransportForTests(null);
  closeDb();
});

test('Vorlage: {monat} und {anzahl} werden ersetzt, Monat ausgeschrieben', () => {
  assert.equal(monthLabel('2026-10'), 'Oktober 2026');
  assert.equal(
    fillTemplate('Hallo Helke,\nanbei die Abrechnung für {monat} ({Anzahl} Lohnzettel). {unbekannt}', { monat: 'März 2024', anzahl: 3 }),
    'Hallo Helke,\nanbei die Abrechnung für März 2024 (3 Lohnzettel). {unbekannt}'
  );
});

test('Einstellungen: Standardtext, Speichern mit Protokoll', () => {
  const initial = PayrollMailService.getInfo();
  assert.deepEqual(initial.settings, { recipient: '', subject: DEFAULT_SUBJECT, body: DEFAULT_BODY, updatedAt: null });
  assert.equal(initial.smtpConfigured, false, 'ohne SMTP_HOST kein Versand');

  const saved = PayrollMailService.updateSettings(
    { recipient: 'buchhaltung@schoppmann.de', subject: 'Abrechnung {monat}', body: 'Hallo Helke,\n\nanbei die Abrechnung für {monat}.\n\nLiebe Grüße' },
    actorOf(admin)
  );
  assert.equal(saved.settings.recipient, 'buchhaltung@schoppmann.de');
  assert.ok(saved.settings.updatedAt instanceof Date);

  // Zweites Speichern ändert dieselbe Zeile
  PayrollMailService.updateSettings({ ...saved.settings, subject: 'Lohnabrechnung {monat}' }, actorOf(admin));
  assert.equal(PayrollMailService.getInfo().settings.subject, 'Lohnabrechnung {monat}');
});

test('Versand: ohne Mailserver abgelehnt', async () => {
  await assert.rejects(PayrollMailService.send('2024-03', actorOf(admin)), { code: 'MAIL_NOT_CONFIGURED' });
});

test('Versand: erst wenn alle Perioden abgeschlossen sind, dann PDF an den Empfänger', async () => {
  setMailTransportForTests(fakeTransport);
  const berta = await makeUser({ name: 'Berta Beispiel' }, 'mail');
  const carl = await makeUser({ name: 'Carl Clever' }, 'mail');
  await makeUser({ name: 'Nina Nichts' }, 'mail'); // ohne Einträge: nichts abzurechnen, blockiert nicht
  addEntry(berta, '2024-03-04');
  addEntry(carl, '2024-03-05');

  let status = PayrollMailService.status('2024-03');
  assert.equal(status.configured, true);
  assert.equal(status.ready, false);
  assert.equal(status.openCount, 2);
  await assert.rejects(PayrollMailService.send('2024-03', actorOf(admin)), { code: 'PAYROLL_PERIODS_OPEN' });

  await PeriodService.closePeriod(berta.id, 2024, 3, actorOf(admin));
  status = PayrollMailService.status('2024-03');
  assert.deepEqual([status.ready, status.openCount, status.closedCount], [false, 1, 1]);
  await assert.rejects(PayrollMailService.send('2024-03', actorOf(admin)), /Noch ist 1 Periode offen/);
  assert.equal(sent.length, 0);

  await PeriodService.closePeriod(carl.id, 2024, 3, actorOf(admin));
  status = PayrollMailService.status('2024-03');
  assert.deepEqual([status.ready, status.openCount, status.closedCount, status.lastSent], [true, 0, 2, null]);

  const result = await PayrollMailService.send('2024-03', actorOf(admin));
  assert.deepEqual([result.recipient, result.count], ['buchhaltung@schoppmann.de', 2]);
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.equal(mail.to, 'buchhaltung@schoppmann.de');
  assert.equal(mail.replyTo, admin.email, 'Antworten gehen an den Admin');
  assert.equal(mail.subject, 'Lohnabrechnung März 2024');
  assert.equal(mail.text, 'Hallo Helke,\n\nanbei die Abrechnung für März 2024.\n\nLiebe Grüße');
  assert.equal(mail.attachments.length, 1);
  assert.equal(mail.attachments[0].filename, 'Lohnzettel_2024-03_alle.pdf');
  assert.equal(mail.attachments[0].content.subarray(0, 5).toString(), '%PDF-');

  const last = PayrollMailService.status('2024-03').lastSent;
  assert.equal(last?.recipient, 'buchhaltung@schoppmann.de');
  assert.equal(last?.count, 2);
  assert.equal(last?.actorEmail, admin.email);
  assert.equal(PayrollMailService.status('2024-04').lastSent, null, 'Versand gilt nur für seinen Monat');

  const audit = await AuditService.list({ action: 'payslips.mail' });
  assert.equal(audit.entries.length, 1);
});

test('Versand: Fehler des Mailservers → MAIL_SEND_FAILED, nichts protokolliert', async () => {
  setMailTransportForTests(fakeTransport);
  failNext = Object.assign(new Error('Relay denied'), { responseCode: 550, command: 'RCPT TO' });
  await assert.rejects(PayrollMailService.send('2024-03', actorOf(admin)), { code: 'MAIL_SEND_FAILED', message: /\(SMTP 550\)/ });
  assert.equal((await AuditService.list({ action: 'payslips.mail' })).entries.length, 1);
});

test('Versand: ohne Empfänger abgelehnt', async () => {
  setMailTransportForTests(fakeTransport);
  PayrollMailService.updateSettings({ recipient: '', subject: 'x', body: 'y' }, actorOf(admin));
  assert.equal(PayrollMailService.status('2024-03').configured, false);
  await assert.rejects(PayrollMailService.send('2024-03', actorOf(admin)), { code: 'MAIL_NOT_CONFIGURED' });
});
