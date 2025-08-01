import { ApiResponse, PaginatedResponse } from '../types/api';

// ✅ Time Record Types
export interface TimeRecord {
  id: number;
  userId: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  breakMinutes: number;
  description?: string;
  workTime: string; // HH:mm format
  workMinutes: number;
  earnings: number;
  formattedEarnings: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeRecordSummary {
  totalHours: number;
  totalEarnings: number;
  actualEarnings: number;
  carryIn: number;
  carryOut: number;
  paidThisMonth: number;
  minijobLimit: number;
  hourlyRate: number;
  exceedsLimit: boolean;
  entryCount: number;
}

export interface BillingPeriod {
  value: string; // YYYY-MM
  label: string; // "April 2025 (01.04.2025 – 30.04.2025)"
  year: number;
  month: number;
  monthName: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface MonthlyTimeRecords {
  records: TimeRecord[];
  summary: TimeRecordSummary;
  period: {
    year: number;
    month: number;
    monthName: string;
    startDate: string;
    endDate: string;
  };
}

export interface CreateTimeRecordRequest {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  description?: string;
}

export interface UpdateTimeRecordRequest {
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  description?: string;
}

export interface MultiMonthStats {
  monthlyStats: Array<TimeRecordSummary & {
    year: number;
    month: number;
    monthName: string;
  }>;
  totalStats: {
    totalHours: number;
    totalEarnings: number;
    averageMonthlyHours: number;
  };
}

/**
 * ✅ Time Record Service - Frontend API Client
 * Handles all time tracking and minijob calculation API calls
 */
class TimeRecordService {
  private static baseUrl = '/api/timerecords';

  /**
   * Authentifizierter API-Request
   */
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = localStorage.getItem('accessToken');
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Holt alle Zeiteinträge für einen Monat mit Minijob-Berechnungen
   */
  static async getMonthlyTimeRecords(month: string): Promise<MonthlyTimeRecords> {
    const response = await this.request<ApiResponse<MonthlyTimeRecords>>(`?month=${month}`);
    return response.data;
  }

  /**
   * Holt verfügbare Abrechnungsperioden für Dropdown
   */
  static async getBillingPeriods(): Promise<{
    periods: BillingPeriod[];
    currentPeriod: BillingPeriod | undefined;
  }> {
    const response = await this.request<ApiResponse<{
      periods: BillingPeriod[];
      currentPeriod: BillingPeriod | undefined;
    }>>('/periods');
    return response.data;
  }

  /**
   * Holt einen einzelnen Zeiteintrag
   */
  static async getTimeRecord(id: number): Promise<TimeRecord> {
    const response = await this.request<ApiResponse<{ entry: TimeRecord }>>(`/${id}`);
    return response.data.entry;
  }

  /**
   * Erstellt einen neuen Zeiteintrag
   */
  static async createTimeRecord(data: CreateTimeRecordRequest): Promise<TimeRecord> {
    const response = await this.request<ApiResponse<{ entry: TimeRecord }>>('', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data.entry;
  }

  /**
   * Aktualisiert einen Zeiteintrag
   */
  static async updateTimeRecord(id: number, data: UpdateTimeRecordRequest): Promise<TimeRecord> {
    const response = await this.request<ApiResponse<{ entry: TimeRecord }>>(`/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.data.entry;
  }

  /**
   * Löscht einen Zeiteintrag
   */
  static async deleteTimeRecord(id: number): Promise<void> {
    await this.request<ApiResponse<void>>(`/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Holt Multi-Monats-Statistiken
   */
  static async getMultiMonthStats(months: number = 12): Promise<MultiMonthStats> {
    const response = await this.request<ApiResponse<MultiMonthStats>>(`/stats/multi-month?months=${months}`);
    return response.data;
  }

  /**
   * Development: Erstellt Testdaten
   */
  static async createTestData(): Promise<TimeRecord[]> {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Testdaten nur in Development verfügbar');
    }
    
    const response = await this.request<ApiResponse<{ entries: TimeRecord[] }>>('/dev/create-test-data', {
      method: 'POST',
    });
    return response.data.entries;
  }

  // ✅ Utility Methods

  /**
   * Formatiert Währung in deutschem Format
   */
  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  /**
   * Formatiert Datum für deutsche Anzeige
   */
  static formatDate(dateString: string): string {
    const date = new Date(dateString + 'T12:00:00.000Z');
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  /**
   * Formatiert Zeit für Anzeige (HH:mm)
   */
  static formatTime(timeString: string): string {
    if (!timeString) return '--:--';
    return timeString.substring(0, 5);
  }

  /**
   * Konvertiert Minuten zu HH:mm Format
   */
  static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Validiert Zeitformat (HH:mm)
   */
  static validateTimeFormat(time: string): boolean {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  }

  /**
   * Validiert Datumsformat (YYYY-MM-DD)
   */
  static validateDateFormat(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
  }

  /**
   * Berechnet Arbeitszeit zwischen zwei Uhrzeiten (in Minuten)
   */
  static calculateWorkMinutes(startTime: string, endTime: string, breakMinutes: number = 0): number {
    if (!this.validateTimeFormat(startTime) || !this.validateTimeFormat(endTime)) {
      return 0;
    }

    const [startHours, startMins] = startTime.split(':').map(Number);
    const [endHours, endMins] = endTime.split(':').map(Number);

    const startTotalMinutes = startHours * 60 + startMins;
    let endTotalMinutes = endHours * 60 + endMins;

    // Über Mitternacht arbeiten berücksichtigen
    if (endTotalMinutes < startTotalMinutes) {
      endTotalMinutes += 24 * 60;
    }

    const workMinutes = endTotalMinutes - startTotalMinutes - breakMinutes;
    return Math.max(0, workMinutes);
  }

  /**
   * Gibt aktuellen Monat im YYYY-MM Format zurück
   */
  static getCurrentMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Navigiert zu vorherigem Monat
   */
  static getPreviousMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1); // month - 2 weil getMonth() 0-basiert ist
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  /**
   * Navigiert zu nächstem Monat
   */
  static getNextMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month, 1); // month (nicht month-1) für nächsten Monat
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  /**
   * Prüft ob Minijob-Grenze überschritten wurde
   */
  static checkMinijobLimitExceeded(summary: TimeRecordSummary): {
    exceeded: boolean;
    excessAmount: number;
    warningMessage?: string;
  } {
    const exceeded = summary.exceedsLimit;
    const excessAmount = Math.max(0, summary.carryOut);

    if (exceeded) {
      return {
        exceeded: true,
        excessAmount,
        warningMessage: `Die Minijob-Grenze von ${this.formatCurrency(summary.minijobLimit)} wurde überschritten. ${this.formatCurrency(excessAmount)} werden in den nächsten Monat übertragen.`
      };
    }

    return {
      exceeded: false,
      excessAmount: 0
    };
  }

  /**
   * Validiert Zeiteintrag-Daten
   */
  static validateTimeRecord(data: CreateTimeRecordRequest | UpdateTimeRecordRequest): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Datum validieren (nur bei CREATE)
    if ('date' in data) {
      if (!data.date) {
        errors.push('Datum ist erforderlich');
      } else if (!this.validateDateFormat(data.date)) {
        errors.push('Datum muss im Format YYYY-MM-DD sein');
      }
    }

    // Startzeit validieren
    if (data.startTime) {
      if (!this.validateTimeFormat(data.startTime)) {
        errors.push('Startzeit muss im Format HH:mm sein');
      }
    }

    // Endzeit validieren
    if (data.endTime) {
      if (!this.validateTimeFormat(data.endTime)) {
        errors.push('Endzeit muss im Format HH:mm sein');
      }
    }

    // Zeit-Logik validieren
    if (data.startTime && data.endTime) {
      const workMinutes = this.calculateWorkMinutes(
        data.startTime, 
        data.endTime, 
        data.breakMinutes || 0
      );

      if (workMinutes <= 0) {
        errors.push('Endzeit muss nach Startzeit liegen');
      }

      if (workMinutes < 15) {
        errors.push('Mindestarbeitszeit beträgt 15 Minuten');
      }
    }

    // Pausenzeit validieren
    if (data.breakMinutes !== undefined) {
      if (data.breakMinutes < 0 || data.breakMinutes > 480) {
        errors.push('Pausendauer muss zwischen 0 und 480 Minuten liegen');
      }
    }

    // Beschreibung validieren
    if (data.description && data.description.length > 500) {
      errors.push('Beschreibung darf maximal 500 Zeichen haben');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default TimeRecordService;