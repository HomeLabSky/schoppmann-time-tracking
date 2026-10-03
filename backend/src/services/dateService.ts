/**
 * Datumshilfen für Abrechnungsperioden. Alle Daten als 'YYYY-MM-DD'; gerechnet wird in UTC, damit
 * Sommer-/Winterzeit keine Tage verschiebt. "Heute" ist der Berliner Kalendertag (utils/clock.ts).
 */
import { todayString } from '../utils/clock';

export interface BillingPeriod {
  startDate: string;
  endDate: string;
  description: string;
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export class DateService {
  /** Tag vor dem gegebenen Datum */
  static getDateBefore(dateString: string): string {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return isoDay(date);
  }

  /** Heutiges Datum (Europe/Berlin) */
  static getTodayString(): string {
    return todayString();
  }

  /** 'YYYY-MM-DD' → 'DD.MM.YYYY' */
  static formatDateForDisplay(dateString: string | null | undefined): string {
    if (!dateString) return 'Kein Datum';
    const date = new Date(`${dateString}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return 'Ungültiges Datum';
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  }

  /**
   * Abrechnungsperiode zum Referenzdatum.
   * startDay ≤ endDay: innerhalb eines Monats (Endtag wird bei kurzen Monaten gekürzt).
   * startDay > endDay: monatsübergreifend (z. B. 22. bis 21. des Folgemonats).
   */
  static createBillingPeriod(startDay: number, endDay: number, referenceDate: string | null = null): BillingPeriod {
    const refDate = referenceDate ? new Date(`${referenceDate}T12:00:00.000Z`) : new Date();
    const year = refDate.getUTCFullYear();
    const month = refDate.getUTCMonth(); // 0-basiert

    let startDate: Date;
    let endDate: Date;
    if (startDay <= endDay) {
      startDate = new Date(Date.UTC(year, month, startDay));
      const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      endDate = new Date(Date.UTC(year, month, Math.min(endDay, lastDayOfMonth)));
    } else {
      startDate = new Date(Date.UTC(year, month, startDay));
      const nextYear = month === 11 ? year + 1 : year;
      const nextMonth = month === 11 ? 0 : month + 1;
      const lastDayOfNextMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
      endDate = new Date(Date.UTC(nextYear, nextMonth, Math.min(endDay, lastDayOfNextMonth)));
    }

    return {
      startDate: isoDay(startDate),
      endDate: isoDay(endDate),
      description: startDay <= endDay
        ? `${startDay}. - ${endDay}. des Monats`
        : `${startDay}. des Monats - ${endDay}. des Folgemonats`
    };
  }
}

export default DateService;
