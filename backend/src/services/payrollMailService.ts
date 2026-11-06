import { and, desc, eq, sql } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';
import config from '../config';
import { db, transaction } from '../db/client';
import { auditLogs, payrollMailSettings, type PayrollMailSettingsRow } from '../db/schema';
import { AppError } from '../lib/errors';
import logger from '../lib/logger';
import { payslipFilename, renderPayslipsPdf } from '../utils/payslipPdf';
import { AuditService, type Actor } from './auditService';
import { PayslipService } from './payslipService';
import { PeriodService } from './periodService';
import { TimeEntryService } from './timeEntryService';

/**
 * Lohnabrechnung per E-Mail: Sind alle Perioden eines Monats abgeschlossen, schickt der Admin die Sammel-PDF (dieselbe Datei wie
 * „Alle Lohnzettel (PDF)“) mit einem Klick an eine fest hinterlegte Adresse, z. B. die Buchhaltung.
 *
 * Empfänger, Betreff und Text pflegt der Admin in den Einstellungen; Platzhalter {monat} (z. B. „Oktober 2026“) und {anzahl}
 * (Zahl der Lohnzettel) werden beim Versand ersetzt. Der Mailserver (z. B. Exchange) steht in der Umgebung (SMTP_*).
 * Jeder Versand steht im Änderungsprotokoll (`payslips.mail`) – daraus zeigt die Oberfläche „zuletzt gesendet“.
 */

export const DEFAULT_SUBJECT = 'Lohnabrechnung {monat}';
export const DEFAULT_BODY = 'Hallo,\n\nanbei die Abrechnung für {monat}.\n\nLiebe Grüße';

export const MAIL_ACTION = 'payslips.mail';

export interface PayrollMailSettings {
  recipient: string;
  subject: string;
  body: string;
  updatedAt: Date | null;
}

export interface PayrollMailInfo {
  settings: PayrollMailSettings;
  /** Mailserver in der Umgebung eingerichtet (SMTP_HOST und Absender) */
  smtpConfigured: boolean;
  /** Absenderadresse laut Umgebung (leer = nicht eingerichtet) */
  sender: string;
}

export interface PayrollMailStatus {
  month: string;
  /** Mailserver und Empfänger sind eingerichtet */
  configured: boolean;
  recipient: string;
  /** Mitarbeiter mit etwas abzurechnen, deren Periode noch offen ist */
  openCount: number;
  /** Abgeschlossene Perioden (= Lohnzettel in der PDF) */
  closedCount: number;
  /** Alle Perioden abgeschlossen (und mindestens eine vorhanden) */
  ready: boolean;
  lastSent: { sentAt: Date; recipient: string; count: number; actorEmail: string } | null;
}

export interface PayrollMailResult {
  month: string;
  recipient: string;
  count: number;
  sentAt: Date;
}

// Tests ersetzen den Versandweg (kein echter Mailserver nötig)
let transportOverride: Transporter | null = null;
export const setMailTransportForTests = (transport: Transporter | null): void => {
  transportOverride = transport;
};

const smtpConfigured = (): boolean => transportOverride !== null || Boolean(config.smtp.host && config.smtp.from);

const createTransport = (): Transporter =>
  transportOverride ?? nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    // Ohne Benutzer: anonymes Relay (Exchange-Empfangsconnector für die IP des Servers)
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    tls: { rejectUnauthorized: config.smtp.rejectUnauthorized },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000
  });

const toSettings = (row: PayrollMailSettingsRow | undefined): PayrollMailSettings => ({
  recipient: row?.recipient ?? '',
  subject: row?.subject ?? DEFAULT_SUBJECT,
  body: row?.body ?? DEFAULT_BODY,
  updatedAt: row?.updatedAt ?? null
});

const loadRow = () => db().select().from(payrollMailSettings).where(eq(payrollMailSettings.id, 1)).get();

/** „2026-10“ → „Oktober 2026“ */
export const monthLabel = (month: string): string => {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  return `${TimeEntryService.getMonthName(monthNumber)} ${year}`;
};

/** Platzhalter {monat} und {anzahl} ersetzen (Groß-/Kleinschreibung egal) */
export const fillTemplate = (template: string, values: { monat: string; anzahl: number }): string =>
  template.replace(/\{(monat|anzahl)\}/gi, (_match, key: string) => String(values[key.toLowerCase() as 'monat' | 'anzahl']));

const parseMonth = (month: string): [number, number] => {
  const [year = 0, monthNumber = 0] = month.split('-').map(Number);
  return [year, monthNumber];
};

const lastSent = (month: string): PayrollMailStatus['lastSent'] => {
  const row = db().select().from(auditLogs)
    .where(and(eq(auditLogs.action, MAIL_ACTION), sql`json_extract(${auditLogs.meta}, '$.month') = ${month}`))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(1)
    .get();
  if (!row) return null;
  const meta = (row.meta ?? {}) as { recipient?: string; count?: number };
  return { sentAt: row.createdAt, recipient: meta.recipient ?? '', count: meta.count ?? 0, actorEmail: row.actorEmail };
};

export class PayrollMailService {
  static getInfo(): PayrollMailInfo {
    return { settings: toSettings(loadRow()), smtpConfigured: smtpConfigured(), sender: config.smtp.from };
  }

  static updateSettings(input: { recipient: string; subject: string; body: string }, actor: Actor): PayrollMailInfo {
    transaction(() => {
      const before = loadRow();
      const values = { recipient: input.recipient, subject: input.subject, body: input.body, updatedBy: actor?.id ?? null };
      const after = before
        ? db().update(payrollMailSettings).set(values).where(eq(payrollMailSettings.id, 1)).returning().get()
        : db().insert(payrollMailSettings).values({ id: 1, ...values }).returning().get();
      AuditService.record({
        actor,
        action: 'payroll_mail.update',
        entityType: 'PayrollMailSettings',
        entityId: 1,
        before: before ? { recipient: before.recipient, subject: before.subject, body: before.body } : null,
        after: { recipient: after.recipient, subject: after.subject, body: after.body }
      });
    });
    return PayrollMailService.getInfo();
  }

  /** Versandstand für einen Referenzmonat (YYYY-MM): bereit, offene Perioden, zuletzt gesendet. */
  static status(month: string): PayrollMailStatus {
    const [year, monthNumber] = parseMonth(month);
    const rows = PeriodService.overview(year, monthNumber).filter((r) => r.billable);
    const closedCount = rows.filter((r) => r.status === 'closed').length;
    const openCount = rows.length - closedCount;
    const { recipient } = toSettings(loadRow());
    return {
      month,
      configured: smtpConfigured() && recipient !== '',
      recipient,
      openCount,
      closedCount,
      ready: openCount === 0 && closedCount > 0,
      lastSent: lastSent(month)
    };
  }

  /**
   * Sammel-PDF des Monats an den hinterlegten Empfänger senden. Nur wenn alle Perioden abgeschlossen sind – sonst fehlten in
   * der Buchhaltung Lohnzettel. Antwort-Adresse ist der auslösende Admin.
   */
  static async send(month: string, actor: Actor): Promise<PayrollMailResult> {
    const settings = toSettings(loadRow());
    if (!smtpConfigured()) {
      throw new AppError('MAIL_NOT_CONFIGURED', 'Der Mailserver ist nicht eingerichtet (SMTP_HOST und SMTP_FROM in der Umgebung des Servers)');
    }
    if (!settings.recipient) {
      throw new AppError('MAIL_NOT_CONFIGURED', 'Bitte zuerst in den Einstellungen den Empfänger der Lohnabrechnung hinterlegen');
    }
    const status = PayrollMailService.status(month);
    if (!status.ready) {
      throw new AppError(
        'PAYROLL_PERIODS_OPEN',
        status.closedCount === 0
          ? 'Für diesen Monat ist noch keine Periode abgeschlossen'
          : `Noch ${status.openCount === 1 ? 'ist 1 Periode' : `sind ${status.openCount} Perioden`} offen – bitte zuerst alle abschließen`,
        { extra: { openCount: status.openCount } }
      );
    }

    const [year, monthNumber] = parseMonth(month);
    const payslips = PayslipService.allForMonth(year, monthNumber);
    const pdf = await renderPayslipsPdf(payslips, { companyAddress: config.payslip.companyAddress });
    const values = { monat: monthLabel(month), anzahl: payslips.length };

    try {
      await createTransport().sendMail({
        from: config.smtp.from || undefined,
        to: settings.recipient,
        replyTo: actor?.email || undefined,
        subject: fillTemplate(settings.subject, values),
        text: fillTemplate(settings.body, values),
        attachments: [{ filename: payslipFilename(month), content: pdf, contentType: 'application/pdf' }]
      });
    } catch (error) {
      const e = error as { code?: string; responseCode?: number; command?: string };
      logger.warn({ code: e.code, responseCode: e.responseCode, command: e.command }, 'Lohnabrechnung: Versand fehlgeschlagen');
      // Kurzer technischer Grund (z. B. „SMTP 550“ = Relay verweigert, „ECONNREFUSED“ = Server nicht erreichbar) hilft beim Einrichten
      const reason = e.responseCode ? `SMTP ${e.responseCode}` : e.code ?? null;
      throw new AppError(
        'MAIL_SEND_FAILED',
        `Die E-Mail konnte nicht gesendet werden${reason ? ` (${reason})` : ''} – bitte Mailserver-Einstellungen prüfen`,
        { cause: error, extra: { reason } }
      );
    }

    const entry = AuditService.record({
      actor,
      action: MAIL_ACTION,
      entityType: 'Payslips',
      meta: { month, recipient: settings.recipient, count: payslips.length, employees: payslips.map((p) => p.employee.id) }
    });
    return { month, recipient: settings.recipient, count: payslips.length, sentAt: entry.createdAt };
  }
}

export default PayrollMailService;
