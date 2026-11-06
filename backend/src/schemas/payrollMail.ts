/** Schemas für den Versand der Lohnabrechnung per E-Mail (Admin). */
import validator from 'validator';
import { z, month, timestamp } from './common';

const PayrollMailSettingsBody = z.object({
  recipient: z.string({ error: 'Empfänger ist erforderlich' })
    .trim()
    .max(255, 'Empfänger darf höchstens 255 Zeichen haben')
    .refine((value) => value === '' || validator.isEmail(value), 'Bitte eine gültige E-Mail-Adresse eingeben')
    .describe('Empfänger der Lohnabrechnung (leer = Versand aus)'),
  subject: z.string({ error: 'Betreff ist erforderlich' })
    .trim()
    .min(1, 'Betreff ist erforderlich')
    .max(200, 'Betreff darf höchstens 200 Zeichen haben')
    .describe('Betreff; {monat} und {anzahl} werden ersetzt'),
  body: z.string({ error: 'Text ist erforderlich' })
    .trim()
    .min(1, 'Text ist erforderlich')
    .max(5000, 'Text darf höchstens 5000 Zeichen haben')
    .describe('Text der E-Mail; {monat} und {anzahl} werden ersetzt')
});

const PayrollMailSettings = z.object({
  recipient: z.string(),
  subject: z.string(),
  body: z.string(),
  updatedAt: timestamp().nullable()
}).meta({ id: 'PayrollMailSettings', description: 'Empfänger und Text für den Versand der Lohnabrechnung' });

const PayrollMailInfoData = z.object({
  settings: PayrollMailSettings,
  smtpConfigured: z.boolean().describe('Mailserver in der Umgebung des Servers eingerichtet (SMTP_HOST, SMTP_FROM)'),
  sender: z.string().describe('Absenderadresse (leer = nicht eingerichtet)')
});

const PayrollMailBody = z.object({ month: month() });

const PayrollMailStatusData = z.object({
  month: z.string(),
  configured: z.boolean().describe('Mailserver und Empfänger eingerichtet'),
  recipient: z.string(),
  openCount: z.number().int().describe('Mitarbeiter mit noch offener Periode'),
  closedCount: z.number().int().describe('Abgeschlossene Perioden (= Lohnzettel in der PDF)'),
  ready: z.boolean().describe('Alle Perioden abgeschlossen, mindestens eine vorhanden'),
  lastSent: z.object({
    sentAt: timestamp(),
    recipient: z.string(),
    count: z.number().int(),
    actorEmail: z.string()
  }).nullable().describe('Letzter Versand für diesen Monat')
}).meta({ id: 'PayrollMailStatus' });

const PayrollMailResultData = z.object({
  month: z.string(),
  recipient: z.string(),
  count: z.number().int().describe('Anzahl Lohnzettel in der PDF'),
  sentAt: timestamp()
});

export { PayrollMailSettingsBody, PayrollMailInfoData, PayrollMailBody, PayrollMailStatusData, PayrollMailResultData };
