/**
 * Lohnzettel als PDF (A4, pdfkit). Ein oder mehrere Lohnzettel in einer Datei; jeder beginnt auf einer neuen Seite
 * und hat eigene Seitenzahlen. Passt der Arbeitszeitnachweis nicht auf eine Seite, läuft er mit wiederholtem
 * Tabellenkopf auf der nächsten weiter.
 *
 * Schrift: die PDF-Standardschriften (Helvetica/Times) – keine Schriftdateien nötig, Umlaute, ß und € sind
 * enthalten. Zeichen außerhalb dieses Zeichensatzes (z. B. Emojis in Beschreibungen) werden durch "?" ersetzt.
 */
import PDFDocument from 'pdfkit';
import type { TimeEntryJSON } from '../models/timeEntry';

/** Alles, was auf einem Lohnzettel steht (Beträge in Cent, aus dem Abschluss eingefroren). */
export interface Payslip {
  closureId: number;
  employee: { id: number; name: string; email: string };
  period: { startDate: string; endDate: string; label: string };
  closedAt: Date;
  entries: TimeEntryJSON[];
  totals: {
    minutes: number;
    entryCount: number;
    workDays: number;
    earningsCents: number;
    carryInCents: number;
    limitCents: number;
    paidCents: number;
    carryOutCents: number;
  };
}

export interface PayslipPdfOptions {
  /** Firmenanschrift im Kopf (Zeilen) */
  companyAddress?: string[];
  /** Erstellungszeitpunkt (Tests) */
  now?: Date;
}

type Doc = PDFKit.PDFDocument;

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 50, right: 50, top: 45, bottom: 60 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const RIGHT = PAGE.width - MARGIN.right;
const FOOTER_Y = PAGE.height - 42;

const COLOR = {
  brand: '#1f3a5c',
  text: '#1c2430',
  muted: '#5b6472',
  line: '#d5d9e0',
  fill: '#f2f4f7'
};

const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold', serif: 'Times-Bold' };

// ----- Formatierung -----

const euroFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const euros = (cents: number): string => `${euroFormat.format(cents / 100)} €`;
const hours = (minutes: number): string => euroFormat.format(Math.round((minutes / 60) * 100) / 100);
const date = (iso: string): string => iso.split('-').reverse().join('.');
const weekday = (iso: string): string =>
  new Date(`${iso}T12:00:00.000Z`).toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
// Windows-1252 (WinAnsi): Zeichensatz der PDF-Standardschriften
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
/** Zeichen, die die Standardschriften nicht darstellen können, durch "?" ersetzen (Zeilenumbrüche → Leerzeichen). */
export const toWinAnsi = (text: string): string =>
  Array.from(text.replace(/[\r\n\t]+/g, ' '), (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch) ? ch : '?';
  }).join('');

/** Text auf eine Breite kürzen (mit "…") */
const fit = (doc: Doc, text: string, width: number): string => {
  if (doc.widthOfString(text) <= width) return text;
  let cut = text;
  while (cut.length > 0 && doc.widthOfString(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
};

const write = (doc: Doc, text: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}): void => {
  doc.text(toWinAnsi(text), x, y, { lineBreak: false, ...options });
};

const hr = (doc: Doc, y: number, color = COLOR.line, width = 0.75): void => {
  doc.moveTo(MARGIN.left, y).lineTo(RIGHT, y).lineWidth(width).strokeColor(color).stroke();
};

// ----- Bausteine -----

/** Bildmarke aus dem Firmenlogo (gleiche Geometrie wie components/brand/logo.tsx im Frontend, viewBox 64×48) */
const drawLogoMark = (doc: Doc, x: number, y: number, size: number): void => {
  const scale = size / 64;
  doc.save().translate(x, y).scale(scale);
  doc.lineWidth(3.2).lineJoin('miter').strokeColor(COLOR.brand);
  doc.path('M11 41V23.5L19.5 16L26 21.5').stroke();
  doc.path('M26 41V13.5L35 5.5L44 13.5V41').stroke();
  doc.path('M44 22H54V41').stroke();
  doc.fillColor(COLOR.brand);
  for (const [rx, ry, w, h] of [
    [31.2, 15, 2.6, 4], [36.2, 15, 2.6, 4], [31.2, 22, 2.6, 4], [36.2, 22, 2.6, 4],
    [16.5, 27, 2.6, 4], [48.4, 27, 2.6, 4], [32.8, 32, 4.4, 9]
  ] as const) {
    doc.rect(rx, ry, w, h).fill();
  }
  doc.lineWidth(2.6).lineCap('round').path('M4 44.5C20 38.5 44 38.5 60 44.5').stroke();
  doc.restore();
};

/** Kopf: Logo und Anschrift links, Titel und Periode rechts. Gibt die y-Position darunter zurück. */
const drawHeader = (doc: Doc, payslip: Payslip, address: string[], continued: boolean): number => {
  const top = MARGIN.top;
  drawLogoMark(doc, MARGIN.left, top, 46);
  doc.fillColor(COLOR.brand).font(FONT.serif).fontSize(16);
  write(doc, 'SCHOPPMANN', MARGIN.left + 54, top + 7, { characterSpacing: 0.6 });
  doc.font(FONT.regular).fontSize(6.4).fillColor(COLOR.brand);
  write(doc, 'IMMOBILIEN & VERMÖGENSVERWALTUNG', MARGIN.left + 54, top + 26, { characterSpacing: 0.9 });

  let leftY = top + 46;
  doc.font(FONT.regular).fontSize(8).fillColor(COLOR.muted);
  for (const line of address) {
    write(doc, line, MARGIN.left, leftY);
    leftY += 10;
  }

  const titleWidth = 240;
  const titleX = RIGHT - titleWidth;
  doc.font(FONT.bold).fontSize(20).fillColor(COLOR.text);
  write(doc, continued ? 'Lohnzettel (Fortsetzung)' : 'Lohnzettel', titleX, top + 2, { width: titleWidth, align: 'right' });
  doc.font(FONT.bold).fontSize(11).fillColor(COLOR.brand);
  write(doc, continued ? `${payslip.employee.name} · ${payslip.period.label}` : payslip.period.label, titleX, top + 28, {
    width: titleWidth,
    align: 'right'
  });
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted);
  write(doc, `Abrechnungszeitraum ${date(payslip.period.startDate)} – ${date(payslip.period.endDate)}`, titleX, top + 44, {
    width: titleWidth,
    align: 'right'
  });

  const y = Math.max(leftY, top + 58) + 8;
  hr(doc, y, COLOR.brand, 1.2);
  return y + 16;
};

// Höhe des Blocks unter dem Kopf: Die Abrechnung beginnt immer an derselben Stelle
const INFO_HEIGHT = 3 * 15 + 12;

/** Mitarbeitername unter dem Kopf */
const drawInfo = (doc: Doc, payslip: Payslip, y: number): number => {
  const labelWidth = 92;
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted);
  write(doc, 'Mitarbeiter', MARGIN.left, y);
  doc.font(FONT.bold).fontSize(10).fillColor(COLOR.text);
  write(doc, fit(doc, toWinAnsi(payslip.employee.name), CONTENT_WIDTH - labelWidth), MARGIN.left + labelWidth, y - 1);
  return y + INFO_HEIGHT;
};

/** Abrechnung: Arbeitszeit links, Rechenweg zur Auszahlung rechts */
const drawSummary = (doc: Doc, payslip: Payslip, y: number): number => {
  const t = payslip.totals;
  const height = 104;
  doc.roundedRect(MARGIN.left, y, CONTENT_WIDTH, height, 4).fillColor(COLOR.fill).fill();

  const pad = 14;
  doc.font(FONT.bold).fontSize(10).fillColor(COLOR.brand);
  write(doc, 'Abrechnung', MARGIN.left + pad, y + pad);

  // Links: Arbeitszeit
  const leftX = MARGIN.left + pad;
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted);
  write(doc, 'Arbeitszeit', leftX, y + 36);
  doc.font(FONT.bold).fontSize(16).fillColor(COLOR.text);
  write(doc, `${hours(t.minutes)} Std.`, leftX, y + 48);

  // Rechts: Rechenweg
  const boxX = MARGIN.left + CONTENT_WIDTH / 2 - 10;
  const boxWidth = RIGHT - pad - boxX;
  const line = (label: string, value: string, rowY: number, bold = false, size = 9) => {
    doc.font(bold ? FONT.bold : FONT.regular).fontSize(size).fillColor(bold ? COLOR.text : COLOR.muted);
    write(doc, label, boxX, rowY);
    doc.fillColor(COLOR.text);
    write(doc, value, boxX, rowY, { width: boxWidth, align: 'right' });
  };
  line('Verdienst in diesem Monat', euros(t.earningsCents), y + pad);
  line('+ Übertrag aus Vormonat', euros(t.carryInCents), y + pad + 16);
  doc.moveTo(boxX, y + pad + 34).lineTo(boxX + boxWidth, y + pad + 34).lineWidth(0.75).strokeColor(COLOR.line).stroke();
  line('Auszahlung', euros(t.paidCents), y + pad + 42, true, 12);
  line('Übertrag in den nächsten Monat', euros(t.carryOutCents), y + pad + 64);

  return y + height + 22;
};

interface Column {
  label: string;
  width: number;
  align?: 'left' | 'right';
}

const COLUMNS: Column[] = [
  { label: 'Datum', width: 130 },
  { label: 'Beginn', width: 90 },
  { label: 'Ende', width: 90 },
  { label: 'Std.', width: 85, align: 'right' },
  { label: 'Verdienst', width: 0, align: 'right' }
];
const fixedWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0);
const lastColumn = COLUMNS[COLUMNS.length - 1];
if (lastColumn) lastColumn.width = CONTENT_WIDTH - fixedWidth;

const ROW_HEIGHT = 15;
const CELL_PAD = 5;

const drawRow = (doc: Doc, cells: string[], y: number, { bold = false, fill }: { bold?: boolean; fill?: string } = {}): void => {
  if (fill) doc.rect(MARGIN.left, y, CONTENT_WIDTH, ROW_HEIGHT).fillColor(fill).fill();
  doc.font(bold ? FONT.bold : FONT.regular).fontSize(8.5).fillColor(COLOR.text);
  let x = MARGIN.left;
  COLUMNS.forEach((column, i) => {
    const width = column.width - 2 * CELL_PAD;
    const text = fit(doc, toWinAnsi(cells[i] ?? ''), width);
    write(doc, text, x + CELL_PAD, y + 4, { width, align: column.align ?? 'left' });
    x += column.width;
  });
};

const drawTableHead = (doc: Doc, y: number): number => {
  doc.rect(MARGIN.left, y, CONTENT_WIDTH, ROW_HEIGHT + 2).fillColor(COLOR.brand).fill();
  doc.font(FONT.bold).fontSize(8.5).fillColor('#ffffff');
  let x = MARGIN.left;
  for (const column of COLUMNS) {
    write(doc, column.label, x + CELL_PAD, y + 5, { width: column.width - 2 * CELL_PAD, align: column.align ?? 'left' });
    x += column.width;
  }
  return y + ROW_HEIGHT + 2;
};

/** Arbeitszeitnachweis; bricht bei Bedarf auf Folgeseiten um. Gibt die y-Position darunter zurück. */
const drawEntries = (doc: Doc, payslip: Payslip, y: number, newPage: () => number): number => {
  doc.font(FONT.bold).fontSize(10).fillColor(COLOR.brand);
  write(doc, 'Arbeitszeitnachweis', MARGIN.left, y);
  y = drawTableHead(doc, y + 16);

  const bottom = PAGE.height - MARGIN.bottom;
  if (payslip.entries.length === 0) {
    doc.font(FONT.regular).fontSize(9).fillColor(COLOR.muted);
    write(doc, 'In diesem Monat wurden keine Arbeitszeiten erfasst.', MARGIN.left + CELL_PAD, y + 6);
    return y + ROW_HEIGHT + 12;
  }

  payslip.entries.forEach((entry, i) => {
    if (y + ROW_HEIGHT > bottom) y = drawTableHead(doc, newPage());
    const overnight = entry.endTime < entry.startTime;
    drawRow(doc, [
      `${weekday(entry.date)}, ${date(entry.date)}`,
      entry.startTime,
      overnight ? `${entry.endTime} (+1)` : entry.endTime,
      hours(entry.workMinutes),
      euros(entry.earningsCents)
    ], y, { fill: i % 2 === 1 ? COLOR.fill : undefined });
    y += ROW_HEIGHT;
  });

  if (y + ROW_HEIGHT + 4 > bottom) y = drawTableHead(doc, newPage());
  hr(doc, y + 1, COLOR.text, 0.75);
  drawRow(doc, ['Summe', '', '', hours(payslip.totals.minutes), euros(payslip.totals.earningsCents)], y + 3, { bold: true });
  return y + ROW_HEIGHT + 18;
};

/** Fußzeile mit Seitenzahl "x von y" je Lohnzettel (nach dem Zeichnen aller Seiten) */
const drawFooters = (doc: Doc, ranges: { payslip: Payslip; first: number; count: number }[]): void => {
  for (const { payslip, first, count } of ranges) {
    for (let i = 0; i < count; i++) {
      doc.switchToPage(first + i);
      // Fußzeile liegt im unteren Rand: Rand kurz aufheben, sonst legt pdfkit eine neue Seite an
      const margin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      hr(doc, FOOTER_Y - 6);
      doc.font(FONT.regular).fontSize(7.5).fillColor(COLOR.muted);
      write(doc, `Schoppmann Zeiterfassung · Lohnzettel ${payslip.period.label} · ${payslip.employee.name}`, MARGIN.left, FOOTER_Y, {
        width: CONTENT_WIDTH - 80
      });
      write(doc, `Seite ${i + 1} von ${count}`, RIGHT - 80, FOOTER_Y, { width: 80, align: 'right' });
      doc.page.margins.bottom = margin;
    }
  }
};

/** Erzeugt eine PDF-Datei mit einem Lohnzettel je Mitarbeiter (jeweils ab neuer Seite). */
export const renderPayslipsPdf = (payslips: Payslip[], options: PayslipPdfOptions = {}): Promise<Buffer> => {
  const now = options.now ?? new Date();
  const address = options.companyAddress ?? [];
  const single = payslips.length === 1 ? payslips[0] : undefined;

  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGIN,
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: toWinAnsi(single ? `Lohnzettel ${single.period.label} – ${single.employee.name}` : 'Lohnzettel'),
      Author: 'Schoppmann Zeiterfassung',
      Creator: 'Schoppmann Zeiterfassung',
      CreationDate: now
    }
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const ranges: { payslip: Payslip; first: number; count: number }[] = [];
  for (const payslip of payslips) {
    doc.addPage();
    const first = doc.bufferedPageRange().count - 1;
    const newPage = () => {
      doc.addPage();
      return drawHeader(doc, payslip, address, true);
    };
    let y = drawHeader(doc, payslip, address, false);
    y = drawInfo(doc, payslip, y);
    y = drawSummary(doc, payslip, y);
    drawEntries(doc, payslip, y, newPage);
    ranges.push({ payslip, first, count: doc.bufferedPageRange().count - first });
  }
  drawFooters(doc, ranges);
  doc.end();
  return done;
};

/** Dateiname ohne Sonderzeichen, z. B. "Lohnzettel_2026-08_Max-Mustermann.pdf" (month: YYYY-MM…) */
export const payslipFilename = (month: string, name?: string): string => {
  const slug = (name ?? 'alle')
    .normalize('NFKD')
    .replace(/ß/g, 'ss')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'Mitarbeiter';
  return `Lohnzettel_${month.slice(0, 7)}_${slug}.pdf`;
};
