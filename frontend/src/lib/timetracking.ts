// frontend/src/lib/timetracking.ts - Korrekte TimeTrackingService Implementierung

import { apiClient } from './api'

// ✅ TypeScript Interfaces
export interface TimeRecord {
  id: number
  userId: number
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  description?: string
  totalHours: number
  workTime: string // Formatierte Arbeitszeit (z.B. "8:30")
  formattedEarnings: string // Formatierter Verdienst (z.B. "102,00 €")
  createdAt: string
  updatedAt: string
}

export interface TimeRecordSummary {
  totalHours: number
  totalEarnings: number
  actualEarnings: number
  carryIn: number
  carryOut: number
  paidThisMonth: number
  minijobLimit: number
  hourlyRate: number
  exceedsLimit: boolean
  entryCount: number
  totalDays?: number
  averageHoursPerDay?: number
  overtimeHours?: number
}

export interface BillingPeriod {
  value: string
  label: string
  year: number
  month: number
  monthName: string
  startDate: string
  endDate: string
  isCurrent: boolean
}

export interface MonthlyTimeRecords {
  month: string
  monthName: string
  year: number
  records: TimeRecord[]
  summary: TimeRecordSummary
  period: BillingPeriod // Dashboard erwartet "period" nicht "billingPeriod"
}

export interface CreateTimeRecordRequest {
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  description?: string
}

export interface UpdateTimeRecordRequest {
  startTime: string
  endTime: string
  breakMinutes: number
  description?: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

// ✅ TimeTrackingService Klasse
class TimeTrackingService {
  
  // ===== DATUM HILFSMETHODEN =====
  
  /**
   * Gibt den aktuellen Monat im Format YYYY-MM zurück
   */
  static getCurrentMonth(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = (now.getMonth() + 1).toString().padStart(2, '0')
    return `${year}-${month}`
  }

  /**
   * Gibt den vorherigen Monat zurück
   */
  static getPreviousMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number)
    const date = new Date(year, month - 2) // month - 1 - 1 (da month-1 für JS Date, dann -1 für vorherigen Monat)
    const newYear = date.getFullYear()
    const newMonth = (date.getMonth() + 1).toString().padStart(2, '0')
    return `${newYear}-${newMonth}`
  }

  /**
   * Gibt den nächsten Monat zurück
   */
  static getNextMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number)
    const date = new Date(year, month) // month - 1 + 1 = month
    const newYear = date.getFullYear()
    const newMonth = (date.getMonth() + 1).toString().padStart(2, '0')
    return `${newYear}-${newMonth}`
  }

  /**
   * Formatiert einen Monat für die Anzeige
   */
  static formatMonthForDisplay(monthString: string): string {
    const [year, month] = monthString.split('-').map(Number)
    const monthNames = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ]
    return `${monthNames[month - 1]} ${year}`
  }

  // ===== API METHODEN =====

  /**
   * Lädt Zeiteinträge für einen bestimmten Monat
   */
  static async getMonthlyTimeRecords(month: string): Promise<MonthlyTimeRecords> {
    try {
      const response = await apiClient.get(`/api/timetracking?month=${month}`)
      return response.data
    } catch (error: any) {
      console.error('Fehler beim Laden der monatlichen Zeitdaten:', error)
      throw new Error(error.message || 'Fehler beim Laden der Zeitdaten')
    }
  }

  /**
   * Lädt verfügbare Abrechnungsperioden
   */
  static async getBillingPeriods(): Promise<{ periods: BillingPeriod[] }> {
    try {
      const response = await apiClient.get('/api/timetracking/periods')
      return response.data
    } catch (error: any) {
      console.error('Fehler beim Laden der Abrechnungsperioden:', error)
      throw new Error(error.message || 'Fehler beim Laden der Abrechnungsperioden')
    }
  }

  /**
   * Lädt einen einzelnen Zeiteintrag
   */
  static async getTimeRecord(id: number): Promise<TimeRecord> {
    try {
      const response = await apiClient.get(`/api/timetracking/${id}`)
      return response.data.record
    } catch (error: any) {
      console.error('Fehler beim Laden des Zeiteintrags:', error)
      throw new Error(error.message || 'Fehler beim Laden des Zeiteintrags')
    }
  }

  /**
   * Erstellt einen neuen Zeiteintrag
   */
  static async createTimeRecord(data: CreateTimeRecordRequest): Promise<TimeRecord> {
    try {
      const response = await apiClient.post('/api/timetracking', data)
      return response.data.record
    } catch (error: any) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error)
      throw new Error(error.message || 'Fehler beim Erstellen des Zeiteintrags')
    }
  }

  /**
   * Aktualisiert einen bestehenden Zeiteintrag
   */
  static async updateTimeRecord(id: number, data: UpdateTimeRecordRequest): Promise<TimeRecord> {
    try {
      const response = await apiClient.put(`/api/timetracking/${id}`, data)
      return response.data.record
    } catch (error: any) {
      console.error('Fehler beim Aktualisieren des Zeiteintrags:', error)
      throw new Error(error.message || 'Fehler beim Aktualisieren des Zeiteintrags')
    }
  }

  /**
   * Löscht einen Zeiteintrag
   */
  static async deleteTimeRecord(id: number): Promise<void> {
    try {
      await apiClient.delete(`/api/timetracking/${id}`)
    } catch (error: any) {
      console.error('Fehler beim Löschen des Zeiteintrags:', error)
      throw new Error(error.message || 'Fehler beim Löschen des Zeiteintrags')
    }
  }

  /**
   * Lädt Multi-Monats-Statistiken
   */
  static async getMultiMonthStats(months: string[]): Promise<any> {
    try {
      const monthsQuery = months.join(',')
      const response = await apiClient.get(`/api/timetracking/stats/multi-month?months=${monthsQuery}`)
      return response.data
    } catch (error: any) {
      console.error('Fehler beim Laden der Multi-Monats-Statistiken:', error)
      throw new Error(error.message || 'Fehler beim Laden der Statistiken')
    }
  }

  // ===== VALIDIERUNGSMETHODEN =====

  /**
   * Validiert einen Zeiteintrag
   */
  static validateTimeRecord(data: CreateTimeRecordRequest): ValidationResult {
    const errors: string[] = []

    // Datum validieren
    if (!data.date) {
      errors.push('Datum ist erforderlich')
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(data.date)) {
        errors.push('Datum muss im Format YYYY-MM-DD sein')
      }
    }

    // Startzeit validieren
    if (!data.startTime) {
      errors.push('Startzeit ist erforderlich')
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
      if (!timeRegex.test(data.startTime)) {
        errors.push('Startzeit muss im Format HH:MM sein')
      }
    }

    // Endzeit validieren
    if (!data.endTime) {
      errors.push('Endzeit ist erforderlich')
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
      if (!timeRegex.test(data.endTime)) {
        errors.push('Endzeit muss im Format HH:MM sein')
      }
    }

    // Zeitlogik validieren
    if (data.startTime && data.endTime) {
      const [startHour, startMin] = data.startTime.split(':').map(Number)
      const [endHour, endMin] = data.endTime.split(':').map(Number)
      
      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin
      
      if (endMinutes <= startMinutes) {
        errors.push('Endzeit muss nach der Startzeit liegen')
      }
    }

    // Pausenzeit validieren
    if (data.breakMinutes < 0) {
      errors.push('Pausenzeit kann nicht negativ sein')
    }

    if (data.breakMinutes > 480) { // Mehr als 8 Stunden Pause
      errors.push('Pausenzeit scheint unrealistisch hoch zu sein')
    }

    // Beschreibung validieren (optional)
    if (data.description && data.description.length > 500) {
      errors.push('Beschreibung darf maximal 500 Zeichen lang sein')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // ===== BERECHNUNGSMETHODEN =====

  /**
   * Berechnet die Arbeitsstunden basierend auf Start-/Endzeit und Pause
   */
  static calculateWorkingHours(startTime: string, endTime: string, breakMinutes: number): number {
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    
    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin
    
    const totalMinutes = endMinutes - startMinutes
    const workingMinutes = totalMinutes - breakMinutes
    
    return Math.max(0, workingMinutes / 60) // Stunden
  }

  /**
   * Formatiert Stunden für die Anzeige
   */
  static formatHours(hours: number): string {
    if (hours === 0) return '0:00'
    
    const wholeHours = Math.floor(hours)
    const minutes = Math.round((hours - wholeHours) * 60)
    
    return `${wholeHours}:${minutes.toString().padStart(2, '0')}`
  }

  /**
   * Formatiert Datum für die Anzeige
   */
  static formatDateForDisplay(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  /**
   * Formatiert Datum für die Anzeige (Kurzform für Dashboard)
   */
  static formatDate(dateString: string): string {
    return this.formatDateForDisplay(dateString)
  }

  /**
   * Formatiert Zeit für die Anzeige
   */
  static formatTimeForDisplay(timeString: string): string {
    return timeString
  }

  /**
   * Formatiert Zeit für die Anzeige (Kurzform für Dashboard)
   */
  static formatTime(timeString: string): string {
    return this.formatTimeForDisplay(timeString)
  }

  /**
   * Formatiert Währung für die Anzeige
   */
  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }
}

// ✅ Default Export
export default TimeTrackingService