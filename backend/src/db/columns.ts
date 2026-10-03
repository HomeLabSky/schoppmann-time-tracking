/**
 * Spaltentypen mit dem Speicherformat der bestehenden Datenbanken.
 *
 * Die Tabellen wurden ursprünglich von Sequelize angelegt; dessen Formate bleiben verbindlich, damit bestehende
 * Datenbanken ohne Datenumwandlung weiterlaufen und Text-Vergleiche in Abfragen (z. B. `createdAt >= …`) stimmen:
 *   Zeitpunkt   'YYYY-MM-DD HH:MM:SS.SSS +00:00'  (immer UTC)
 *   Datum       'YYYY-MM-DD'
 *   Uhrzeit     'HH:MM:SS'
 *   Wahrheit    0 / 1
 */
import { customType } from 'drizzle-orm/sqlite-core';

const SEQUELIZE_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?) ([+-]\d{2}:\d{2})$/;

/** Date → '2026-10-03 14:38:29.458 +00:00' */
export const formatTimestamp = (value: Date): string => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Ungültiger Zeitpunkt: ${String(value)}`);
  }
  const iso = value.toISOString(); // 2026-10-03T14:38:29.458Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)} +00:00`;
};

/** '2026-10-03 14:38:29.458 +00:00' (oder ISO 8601) → Date */
export const parseTimestamp = (value: string): Date => {
  const match = SEQUELIZE_DATETIME.exec(value);
  const date = match ? new Date(`${match[1]}T${match[2]}${match[3]}`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Ungültiger Zeitpunkt in der Datenbank: ${value}`);
  return date;
};

/** Zeitpunkt (DATETIME) im Sequelize-Textformat */
export const timestamp = customType<{ data: Date; driverData: string }>({
  dataType: () => 'DATETIME',
  toDriver: formatTimestamp,
  fromDriver: parseTimestamp
});

/** Kalendertag (DATE) als 'YYYY-MM-DD' */
export const dateOnly = customType<{ data: string; driverData: string }>({
  dataType: () => 'DATE'
});

/** Uhrzeit (TIME) als 'HH:MM:SS' */
export const timeOfDay = customType<{ data: string; driverData: string }>({
  dataType: () => 'TIME'
});

/** JSON in einer TEXT-Spalte; nicht lesbares JSON wird als Text zurückgegeben */
export const jsonText = customType<{ data: unknown; driverData: string }>({
  dataType: () => 'TEXT',
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
});
