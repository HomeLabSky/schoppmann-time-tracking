// frontend/src/lib/timetracking.ts - Reparierter TimeTrackingService mit funktionierendem Übertrag

import { apiClient } from './api'

// ✅ TypeScript Interfaces - Mit funktionierendem Übertrag-System
export interface TimeRecord {
  id: number
  userId: number
  date: string
  startTime: string
  endTime: string
  breakMinutes: number // Für Kompatibilität beibehalten, aber auf 0 gesetzt
  description?: string
  totalHours: number
  workTime: string // Formatierte Arbeitszeit (z.B. "8:30")
  formattedEarnings: string // Formatierter Verdienst (z.B. "102,00 €")
  createdAt: string
  updatedAt: string
}

export interface TimeRecordSummary {
  totalHours: number
  totalEarnings: number // Verdienst nur dieser Periode
  actualEarnings: number // Verdienst inkl. Übertrag aus Vormonat
  carryIn: number // Übertrag aus Vormonat
  carryOut: number // Übertrag für nächsten Monat
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
  breakMinutes: number // Wird im Service auf 0 gesetzt
  description?: string
}

export interface UpdateTimeRecordRequest {
  startTime: string
  endTime: string
  breakMinutes: number // Wird im Service auf 0 gesetzt
  description?: string
}

// ✅ TimeTrackingService Class
class TimeTrackingService {
  
  /**
   * Holt monatliche Zeiteinträge für einen Benutzer
   * @param userId - Benutzer-ID
   * @param year - Jahr
   * @param month - Monat (1-12)
   * @returns Promise mit monatlichen Zeitdaten
   */
  static async getMonthlyTimeRecords(userId: number, year: number, month: number): Promise<MonthlyTimeRecords> {
    try {
      const response = await apiClient.get(`/api/time-records/monthly/${userId}/${year}/${month}`)
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Fehler beim Laden der Zeitdaten')
      }

      return response.data.data
    } catch (error: any) {
      console.error('Fehler beim Laden der monatlichen Zeitdaten:', error)
      
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error)
      }
      
      throw new Error('Zeitdaten konnten nicht geladen werden')
    }
  }

  /**
   * Erstellt einen neuen Zeiteintrag
   * ANGEPASST: Pausenzeit wird automatisch auf 0 gesetzt
   * @param timeRecord - Zeiteintrag-Daten
   * @returns Promise mit dem erstellten Zeiteintrag
   */
  static async createTimeRecord(timeRecord: CreateTimeRecordRequest): Promise<TimeRecord> {
    try {
      // Pausenzeit automatisch auf 0 setzen
      const processedRecord = {
        ...timeRecord,
        breakMinutes: 0
      }

      const response = await apiClient.post('/api/time-records', processedRecord)
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Fehler beim Erstellen des Zeiteintrags')
      }

      return response.data.data
    } catch (error: any) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error)
      
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error)
      }
      
      throw new Error('Zeiteintrag konnte nicht erstellt werden')
    }
  }

  /**
   * Aktualisiert einen Zeiteintrag
   * ANGEPASST: Pausenzeit wird automatisch auf 0 gesetzt
   * @param id - Zeiteintrag-ID
   * @param updateData - Aktualisierungsdaten
   * @returns Promise mit dem aktualisierten Zeiteintrag
   */
  static async updateTimeRecord(id: number, updateData: UpdateTimeRecordRequest): Promise<TimeRecord> {
    try {
      // Pausenzeit automatisch auf 0 setzen
      const processedData = {
        ...updateData,
        breakMinutes: 0
      }

      const response = await apiClient.put(`/api/time-records/${id}`, processedData)
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Fehler beim Aktualisieren des Zeiteintrags')
      }

      return response.data.data
    } catch (error: any) {
      console.error('Fehler beim Aktualisieren des Zeiteintrags:', error)
      
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error)
      }
      
      throw new Error('Zeiteintrag konnte nicht aktualisiert werden')
    }
  }

  /**
   * Löscht einen Zeiteintrag
   * @param id - Zeiteintrag-ID
   * @returns Promise<boolean>
   */
  static async deleteTimeRecord(id: number): Promise<boolean> {
    try {
      const response = await apiClient.delete(`/api/time-records/${id}`)
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Fehler beim Löschen des Zeiteintrags')
      }

      return true
    } catch (error: any) {
      console.error('Fehler beim Löschen des Zeiteintrags:', error)
      
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error)
      }
      
      throw new Error('Zeiteintrag konnte nicht gelöscht werden')
    }
  }

  /**
   * Validiert Zeiteintrag-Daten
   * ANGEPASST: Pausenzeit-Validierung entfernt
   * @param entryData - Zu validierende Daten
   * @returns Validierungsergebnis
   */
  static validateTimeEntry(entryData: CreateTimeRecordRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // Basis-Validierungen
    if (!entryData.date) {
      errors.push('Datum ist erforderlich')
    }

    if (!entryData.startTime) {
      errors.push('Startzeit ist erforderlich')
    }

    if (!entryData.endTime) {
      errors.push('Endzeit ist erforderlich')
    }

    // Zeit-Validierungen
    if (entryData.startTime && entryData.endTime) {
      const startTime = new Date(`2000-01-01T${entryData.startTime}`)
      const endTime = new Date(`2000-01-01T${entryData.endTime}`)
      
      if (endTime <= startTime) {
        errors.push('Endzeit muss nach der Startzeit liegen')
      }

      const totalMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60))
      
      if (totalMinutes > 12 * 60) {
        errors.push('Arbeitszeit darf 12 Stunden nicht überschreiten')
      }

      if (totalMinutes < 15) {
        errors.push('Arbeitszeit muss mindestens 15 Minuten betragen')
      }
    }

    // ENTFERNT: Pausenzeit-Validierung da deaktiviert

    // Datums-Validierung
    if (entryData.date) {
      const entryDate = new Date(entryData.date)
      const today = new Date()
      const oneMonthAgo = new Date()
      oneMonthAgo.setMonth(today.getMonth() - 1)

      if (entryDate > today) {
        errors.push('Datum darf nicht in der Zukunft liegen')
      }

      if (entryDate < oneMonthAgo) {
        errors.push('Datum darf nicht mehr als einen Monat zurückliegen')
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Berechnet Arbeitszeit in Stunden
   * ANGEPASST: Ohne Pausenzeit-Berücksichtigung
   * @param startTime - Startzeit (HH:MM)
   * @param endTime - Endzeit (HH:MM)
   * @returns Arbeitszeit in Stunden
   */
  static calculateWorkHours(startTime: string, endTime: string): number {
    const start = new Date(`2000-01-01T${startTime}`)
    const end = new Date(`2000-01-01T${endTime}`)
    
    if (end <= start) return 0
    
    const totalMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
    
    // GEÄNDERT: Keine Pausenzeit abziehen
    const workMinutes = totalMinutes
    
    return Math.round((workMinutes / 60) * 100) / 100
  }

  /**
   * Formatiert Arbeitszeit für Anzeige
   * @param minutes - Arbeitszeit in Minuten
   * @returns Formatierte Zeit (z.B. "8:30")
   */
  static formatWorkTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}`
  }

  /**
   * Formatiert Verdienst für Anzeige
   * @param earnings - Verdienst in Euro
   * @returns Formatierter Verdienst (z.B. "102,00 €")
   */
  static formatEarnings(earnings: number): string {
    return `${earnings.toFixed(2).replace('.', ',')} €`
  }

  /**
   * Hilfsmethode: Vorherigen Monat berechnen
   * @param currentMonth - Aktueller Monat (YYYY-MM)
   * @returns Vorheriger Monat
   */
  static getPreviousMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    date.setMonth(date.getMonth() - 1)
    
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  /**
   * Hilfsmethode: Nächsten Monat berechnen
   * @param currentMonth - Aktueller Monat (YYYY-MM)
   * @returns Nächster Monat
   */
  static getNextMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    date.setMonth(date.getMonth() + 1)
    
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  /**
   * Generiert verfügbare Abrechnungsperioden (letzte 6 Monate)
   * @returns Array von Abrechnungsperioden
   */
  static generateAvailablePeriods(): BillingPeriod[] {
    const periods: BillingPeriod[] = []
    const today = new Date()
    
    for (let i = 0; i < 6; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const monthName = date.toLocaleDateString('de-DE', { month: 'long' })
      
      periods.push({
        value: `${year}-${String(month).padStart(2, '0')}`,
        label: `${monthName} ${year}`,
        year,
        month,
        monthName,
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: new Date(year, month, 0).toISOString().split('T')[0],
        isCurrent: i === 0
      })
    }
    
    return periods
  }
}

export { TimeTrackingService }