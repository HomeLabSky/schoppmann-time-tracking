import { saveBlob } from './download'

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

const escape = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * CSV für deutsches Excel: Semikolon als Trenner, UTF-8 mit BOM (Umlaute), Zahlen mit Komma.
 * Zahlen sollten daher bereits formatiert übergeben werden (z. B. "13,50").
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escape(c.header)).join(';')
  const body = rows.map((row) => columns.map((c) => escape(c.value(row))).join(';'))
  return '﻿' + [head, ...body].join('\r\n')
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  saveBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

/** Zahl im deutschen Format ohne Währungszeichen, für CSV-Spalten. */
export const csvNumber = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined ? '' : value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
