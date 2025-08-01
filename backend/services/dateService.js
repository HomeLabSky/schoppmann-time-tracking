/**
 * ✅ Date Service - Zentralisierte Datum/Zeit-Verwaltung
 * Enthält alle Datum-bezogenen Berechnungen und Utilities
 */
class DateService {
    /**
     * Sichere Datums-Berechnung: Gibt das Datum einen Tag vor dem gegebenen Datum zurück
     * @param {string} dateString - Datum im Format YYYY-MM-DD
     * @returns {string} Datum einen Tag davor im Format YYYY-MM-DD
     */
    static getDateBefore(dateString) {
        const date = new Date(dateString + 'T00:00:00.000Z'); // UTC um Zeitzone-Probleme zu vermeiden
        date.setUTCDate(date.getUTCDate() - 1);
        return date.toISOString().split('T')[0];
    }

    /**
     * Sichere Datums-Berechnung: Gibt das Datum einen Tag nach dem gegebenen Datum zurück  
     * @param {string} dateString - Datum im Format YYYY-MM-DD
     * @returns {string} Datum einen Tag danach im Format YYYY-MM-DD
     */
    static getDateAfter(dateString) {
        const date = new Date(dateString + 'T00:00:00.000Z');
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().split('T')[0];
    }

    /**
     * Heutiges Datum im Format YYYY-MM-DD
     * @returns {string} Heutiges Datum
     */
    static getTodayString() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Prüft ob ein Datum in der Vergangenheit liegt
     * @param {string} dateString - Datum im Format YYYY-MM-DD
     * @returns {boolean} True wenn Datum in der Vergangenheit liegt
     */
    static isDateInPast(dateString) {
        const inputDate = new Date(dateString + 'T00:00:00.000Z');
        const today = new Date(this.getTodayString() + 'T00:00:00.000Z');
        return inputDate < today;
    }

    /**
     * Prüft ob ein Datum in der Zukunft liegt
     * @param {string} dateString - Datum im Format YYYY-MM-DD
     * @returns {boolean} True wenn Datum in der Zukunft liegt
     */
    static isDateInFuture(dateString) {
        const inputDate = new Date(dateString + 'T00:00:00.000Z');
        const today = new Date(this.getTodayString() + 'T00:00:00.000Z');
        return inputDate > today;
    }

    /**
     * Prüft ob ein Datum heute ist
     * @param {string} dateString - Datum im Format YYYY-MM-DD
     * @returns {boolean} True wenn Datum heute ist
     */
    static isDateToday(dateString) {
        return dateString === this.getTodayString();
    }

    /**
     * Formatiert ein Datum für die deutsche Anzeige
     * @param {string} dateString - Datum im Format YYYY-MM-DD
     * @returns {string} Datum im Format DD.MM.YYYY
     */
    static formatDateForDisplay(dateString) {
        if (!dateString) return 'Kein Datum';

        try {
            const date = new Date(dateString + 'T12:00:00.000Z'); // Mittag UTC für Zeitzone-Sicherheit
            return date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                timeZone: 'UTC'
            });
        } catch (error) {
            return 'Ungültiges Datum';
        }
    }

    /**
     * Berechnet Anzahl Tage zwischen zwei Daten
     * @param {string} startDate - Startdatum YYYY-MM-DD
     * @param {string} endDate - Enddatum YYYY-MM-DD
     * @returns {number} Anzahl Tage zwischen den Daten
     */
    static getDaysBetween(startDate, endDate) {
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end = new Date(endDate + 'T00:00:00.000Z');
        const diffTime = Math.abs(end - start);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Prüft ob zwei Datumsperioden sich überschneiden
     * @param {string} start1 - Start erste Periode
     * @param {string} end1 - Ende erste Periode (null = unbegrenzt)
     * @param {string} start2 - Start zweite Periode  
     * @param {string} end2 - Ende zweite Periode (null = unbegrenzt)
     * @returns {boolean} True wenn Perioden sich überschneiden
     */
    static doPeriodsOverlap(start1, end1, start2, end2) {
        const s1 = new Date(start1 + 'T00:00:00.000Z');
        const e1 = end1 ? new Date(end1 + 'T23:59:59.999Z') : null;
        const s2 = new Date(start2 + 'T00:00:00.000Z');
        const e2 = end2 ? new Date(end2 + 'T23:59:59.999Z') : null;

        // Wenn beide Perioden unbegrenzt sind, überschneiden sie sich
        if (!e1 && !e2) return true;

        // Wenn erste Periode unbegrenzt ist
        if (!e1) return s1 <= (e2 || new Date('9999-12-31'));

        // Wenn zweite Periode unbegrenzt ist
        if (!e2) return s2 <= e1;

        // Beide Perioden haben Endpunkte
        return s1 <= e2 && s2 <= e1;
    }

    /**
     * Erstellt einen Abrechnungszeitraum basierend auf Start- und Endtag
     * @param {number} startDay - Start-Tag des Monats (1-31)
     * @param {number} endDay - End-Tag des Monats (1-31)  
     * @param {string} referenceDate - Referenzdatum YYYY-MM-DD (default: heute)
     * @returns {Object} { startDate, endDate, description }
     */
    static createBillingPeriod(startDay, endDay, referenceDate = null) {
        const refDate = referenceDate ? new Date(referenceDate + 'T12:00:00.000Z') : new Date();
        const year = refDate.getUTCFullYear();
        const month = refDate.getUTCMonth(); // 0-basiert

        let startDate, endDate;

        if (startDay <= endDay) {
            // Periode innerhalb eines Monats (z.B. 1. - 31.)
            startDate = new Date(Date.UTC(year, month, startDay));

            // KORRIGIERT: Behandle Monate mit weniger als 31 Tagen korrekt
            // Wenn endDay größer als die Anzahl Tage im Monat ist, nimm den letzten Tag des Monats
            const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
            const actualEndDay = Math.min(endDay, lastDayOfMonth);

            endDate = new Date(Date.UTC(year, month, actualEndDay));

            console.log(`📅 Abrechnungsperiode ${startDay}-${endDay}: ${year}-${month + 1}, tatsächlich bis ${actualEndDay}. Tag (Monat hat ${lastDayOfMonth} Tage)`);

        } else {
            // Periode überschreitet Monatswechsel (z.B. 15. - 14. des Folgemonats)
            startDate = new Date(Date.UTC(year, month, startDay));

            // KORRIGIERT: Behandle Monatsübergreifende Perioden korrekt
            const nextMonth = month + 1;
            const nextYear = nextMonth > 11 ? year + 1 : year;
            const actualNextMonth = nextMonth > 11 ? 0 : nextMonth;

            // Prüfe ob der endDay im Folgemonat existiert
            const lastDayOfNextMonth = new Date(Date.UTC(nextYear, actualNextMonth + 1, 0)).getUTCDate();
            const actualEndDay = Math.min(endDay, lastDayOfNextMonth);

            endDate = new Date(Date.UTC(nextYear, actualNextMonth, actualEndDay));

            console.log(`📅 Monatsübergreifende Abrechnungsperiode ${startDay}-${endDay}: ${year}-${month + 1} bis ${nextYear}-${actualNextMonth + 1}, tatsächlich bis ${actualEndDay}. Tag`);
        }

        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            description: startDay <= endDay ?
                `${startDay}. - ${endDay}. des Monats` :
                `${startDay}. des Monats - ${endDay}. des Folgemonats`
        };
    }

    /**
 * Validiert Abrechnungsperioden-Einstellungen
 * @param {number} startDay - Start-Tag (1-31)
 * @param {number} endDay - End-Tag (1-31)
 * @returns {Object} { isValid: boolean, error?: string, warning?: string }
 */
    static validateBillingPeriod(startDay, endDay) {
        // Grundvalidierung
        if (startDay < 1 || startDay > 31) {
            return {
                isValid: false,
                error: 'Abrechnungsstart muss zwischen 1 und 31 liegen'
            };
        }

        if (endDay < 1 || endDay > 31) {
            return {
                isValid: false,
                error: 'Abrechnungsende muss zwischen 1 und 31 liegen'
            };
        }

        // Warnung für problematische Tage (29, 30, 31)
        let warning = null;
        if (startDay > 28 || endDay > 28) {
            warning = 'Achtung: Tage 29-31 existieren nicht in allen Monaten. ' +
                'Das System verwendet automatisch den letzten verfügbaren Tag des Monats.';
        }

        return {
            isValid: true,
            warning: warning
        };
    }

    /**
     * Testet die Abrechnungsperioden-Berechnung für verschiedene Szenarien
     * @param {number} startDay - Start-Tag
     * @param {number} endDay - End-Tag
     * @returns {Array} Test-Ergebnisse für verschiedene Monate
     */
    static testBillingPeriodCalculation(startDay, endDay) {
        const testMonths = [
            '2024-01-15', // Januar (31 Tage)
            '2024-02-15', // Februar (29 Tage, Schaltjahr)
            '2024-04-15', // April (30 Tage)
            '2024-07-15', // Juli (31 Tage) - User's problematic month
            '2025-02-15'  // Februar (28 Tage, kein Schaltjahr)
        ];

        return testMonths.map(refDate => {
            const period = this.createBillingPeriod(startDay, endDay, refDate);
            const refMonth = refDate.substring(0, 7);

            return {
                referenceMonth: refMonth,
                period: period,
                dayCount: this.getDaysBetween(period.startDate, period.endDate) + 1
            };
        });
    }

    /**
     * Berechnet alle Abrechnungszeiträume für ein Jahr
     * @param {number} startDay - Start-Tag des Abrechnungszeitraums
     * @param {number} endDay - End-Tag des Abrechnungszeitraums
     * @param {number} year - Jahr für Berechnung
     * @returns {Array} Array von Abrechnungszeiträumen
     */
    static calculateYearlyBillingPeriods(startDay, endDay, year) {
        const periods = [];

        for (let month = 0; month < 12; month++) {
            // KORRIGIERT: UTC-Datum für Konsistenz
            const referenceDate = new Date(Date.UTC(year, month, 15)).toISOString().split('T')[0];
            const period = this.createBillingPeriod(startDay, endDay, referenceDate);

            periods.push({
                ...period,
                month: month + 1, // 1-basiert für Display
                year: year,
                id: `${year}-${String(month + 1).padStart(2, '0')}`
            });
        }

        return periods;
    }

    /**
     * Validiert ein Datum im Format YYYY-MM-DD
     * @param {string} dateString - Zu validierendes Datum
     * @returns {Object} { isValid: boolean, error?: string }
     */
    static validateDateString(dateString) {
        if (!dateString) {
            return { isValid: false, error: 'Datum ist erforderlich' };
        }

        // Regex für YYYY-MM-DD Format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateString)) {
            return { isValid: false, error: 'Datum muss im Format YYYY-MM-DD sein' };
        }

        // Prüfe ob Datum gültig ist
        const date = new Date(dateString + 'T12:00:00.000Z');
        if (isNaN(date.getTime())) {
            return { isValid: false, error: 'Ungültiges Datum' };
        }

        // Prüfe ob Datum dem Input entspricht (verhindert ungültige Daten wie 31. Februar)
        const [year, month, day] = dateString.split('-').map(Number);
        if (date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day) {
            return { isValid: false, error: 'Ungültiges Datum (z.B. 31. Februar)' };
        }

        return { isValid: true };
    }

    /**
     * Konvertiert verschiedene Datumsformate zu YYYY-MM-DD
     * @param {string|Date} input - Input-Datum
     * @returns {string} Datum im Format YYYY-MM-DD
     */
    static normalizeToDateString(input) {
        try {
            let date;

            if (input instanceof Date) {
                date = input;
            } else if (typeof input === 'string') {
                // Verschiedene String-Formate unterstützen
                if (input.includes('.')) {
                    // DD.MM.YYYY Format
                    const [day, month, year] = input.split('.');
                    // KORRIGIERT: Monat ist 0-basiert in Date Constructor
                    date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
                } else {
                    // ISO Format oder anderes
                    date = new Date(input + (input.length === 10 ? 'T12:00:00.000Z' : ''));
                }
            } else {
                throw new Error('Ungültiger Datum-Input');
            }

            if (isNaN(date.getTime())) {
                throw new Error('Ungültiges Datum');
            }

            return date.toISOString().split('T')[0];
        } catch (error) {
            throw new Error(`Datum-Konvertierung fehlgeschlagen: ${error.message}`);
        }
    }

    /**
     * Berechnet Alter in Jahren basierend auf Geburtsdatum
     * @param {string} birthDate - Geburtsdatum YYYY-MM-DD
     * @returns {number} Alter in Jahren
     */
    static calculateAge(birthDate) {
        const birth = new Date(birthDate + 'T00:00:00.000Z');
        const today = new Date();

        let age = today.getUTCFullYear() - birth.getUTCFullYear();
        const monthDiff = today.getUTCMonth() - birth.getUTCMonth();

        // KORRIGIERT: Korrekte Altersberechnung mit UTC
        if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())) {
            age--;
        }

        return age;
    }

    /**
     * Gibt Informationen über einen Datumsbereich zurück
     * @param {string} startDate - Startdatum YYYY-MM-DD
     * @param {string} endDate - Enddatum YYYY-MM-DD (null = unbegrenzt)
     * @returns {Object} Informationen über den Datumsbereich
     */
    static getDateRangeInfo(startDate, endDate = null) {
        const start = new Date(startDate + 'T00:00:00.000Z');
        const today = new Date(this.getTodayString() + 'T00:00:00.000Z');

        let status;
        if (start > today) {
            status = 'future'; // Zukünftig
        } else if (!endDate) {
            status = 'active'; // Aktiv (unbegrenzt)
        } else {
            const end = new Date(endDate + 'T23:59:59.999Z');
            status = end >= today ? 'active' : 'past';
        }

        return {
            startDate,
            endDate,
            status,
            isActive: status === 'active',
            isFuture: status === 'future',
            isPast: status === 'past',
            duration: endDate ? this.getDaysBetween(startDate, endDate) : null,
            startFormatted: this.formatDateForDisplay(startDate),
            endFormatted: endDate ? this.formatDateForDisplay(endDate) : 'Unbegrenzt'
        };
    }
}

module.exports = DateService;