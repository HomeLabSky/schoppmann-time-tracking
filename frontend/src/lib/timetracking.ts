// frontend/src/lib/timetracking.ts - Korrigierte Version

import { apiClient } from './api'

// ✅ TypeScript Interfaces - Mit funktionierendem Übertrag-System
export interface TimeRecord {
  id: number
  userId: number
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  description?: string
  workMinutes: number
  workTime: string
  totalHours: number
  earnings: number
  formattedEarnings: string
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
  records: TimeRecord[]
  summary: TimeRecordSummary
  period: {
    year: number
    month: number
    monthName: string
    startDate: string
    endDate: string
    description: string
  }
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

// ✅ TimeTrackingService Class - KORRIGIERT
class TimeTrackingService {
  
  /**
   * Holt monatliche Zeiteinträge für einen Benutzer
   * KORRIGIERT: Response-Struktur richtig verarbeiten
   */
  static async getMonthlyTimeRecords(userId: number, year: number, month: number): Promise<MonthlyTimeRecords> {
    try {
      const monthParam = `${year}-${String(month).padStart(2, '0')}`
      const response = await apiClient.get(`/api/timetracking?month=${monthParam}`)
      
      // ✅ KORRIGIERT: response ist bereits das data-Objekt
      if (!response.success) {
        throw new Error(response.error || 'Fehler beim Laden der Zeitdaten')
      }

      return response.data
    } catch (error: any) {
      console.error('Fehler beim Laden der monatlichen Zeitdaten:', error)
      
      if (error.error) {
        throw new Error(error.error)
      }
      
      throw new Error('Zeitdaten konnten nicht geladen werden')
    }
  }

  /**
   * Erstellt einen neuen Zeiteintrag
   * KORRIGIERT: Response-Struktur richtig verarbeiten
   */
  static async createTimeRecord(timeRecord: CreateTimeRecordRequest): Promise<TimeRecord> {
    try {
      const processedRecord = {
        ...timeRecord,
        breakMinutes: 0
      }

      const response = await apiClient.post('/api/timetracking', processedRecord)
      
      // ✅ KORRIGIERT: response ist bereits das data-Objekt
      if (!response.success) {
        throw new Error(response.error || 'Fehler beim Erstellen des Zeiteintrags')
      }

      return response.data.entry
    } catch (error: any) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error)
      
      if (error.error) {
        throw new Error(error.error)
      }
      
      throw new Error('Zeiteintrag konnte nicht erstellt werden')
    }
  }

  /**
   * Aktualisiert einen Zeiteintrag
   * KORRIGIERT: Response-Struktur richtig verarbeiten
   */
  static async updateTimeRecord(id: number, updateData: UpdateTimeRecordRequest): Promise<TimeRecord> {
    try {
      const processedData = {
        ...updateData,
        breakMinutes: 0
      }

      const response = await apiClient.put(`/api/timetracking/${id}`, processedData)
      
      // ✅ KORRIGIERT: response ist bereits das data-Objekt
      if (!response.success) {
        throw new Error(response.error || 'Fehler beim Aktualisieren des Zeiteintrags')
      }

      return response.data.entry
    } catch (error: any) {
      console.error('Fehler beim Aktualisieren des Zeiteintrags:', error)
      
      if (error.error) {
        throw new Error(error.error)
      }
      
      throw new Error('Zeiteintrag konnte nicht aktualisiert werden')
    }
  }

  /**
   * Löscht einen Zeiteintrag
   * KORRIGIERT: Response-Struktur richtig verarbeiten
   */
  static async deleteTimeRecord(id: number): Promise<boolean> {
    try {
      const response = await apiClient.delete(`/api/timetracking/${id}`)
      
      // ✅ KORRIGIERT: response ist bereits das data-Objekt
      if (!response.success) {
        throw new Error(response.error || 'Fehler beim Löschen des Zeiteintrags')
      }

      return true
    } catch (error: any) {
      console.error('Fehler beim Löschen des Zeiteintrags:', error)
      
      if (error.error) {
        throw new Error(error.error)
      }
      
      throw new Error('Zeiteintrag konnte nicht gelöscht werden')
    }
  }

  /**
   * Validiert Zeiteintrag-Daten
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
   */
  static calculateWorkHours(startTime: string, endTime: string): number {
    const start = new Date(`2000-01-01T${startTime}`)
    const end = new Date(`2000-01-01T${endTime}`)
    
    if (end <= start) return 0
    
    const totalMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
    const workMinutes = totalMinutes
    
    return Math.round((workMinutes / 60) * 100) / 100
  }

  /**
   * Formatiert Arbeitszeit für Anzeige
   */
  static formatWorkTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}`
  }

  /**
   * Formatiert Verdienst für Anzeige
   */
  static formatEarnings(earnings: number): string {
    return `${earnings.toFixed(2).replace('.', ',')} €`
  }

  /**
   * Holt Abrechnungsperioden für Dropdown
   * KORRIGIERT: Response-Struktur richtig verarbeiten
   */
  static async getBillingPeriods(): Promise<BillingPeriod[]> {
    try {
      const response = await apiClient.get('/api/timetracking/periods')
      
      // ✅ KORRIGIERT: response ist bereits das data-Objekt
      if (!response.success) {
        throw new Error(response.error || 'Fehler beim Laden der Abrechnungsperioden')
      }

      return response.data.periods || []
    } catch (error: any) {
      console.error('Fehler beim Laden der Abrechnungsperioden:', error)
      
      if (error.error) {
        throw new Error(error.error)
      }
      
      throw new Error('Abrechnungsperioden konnten nicht geladen werden')
    }
  }

  /**
   * Holt einen einzelnen Zeiteintrag
   * KORRIGIERT: Response-Struktur richtig verarbeiten
   */
  static async getTimeRecord(id: number): Promise<TimeRecord> {
    try {
      const response = await apiClient.get(`/api/timetracking/${id}`)
      
      // ✅ KORRIGIERT: response ist bereits das data-Objekt
      if (!response.success) {
        throw new Error(response.error || 'Fehler beim Laden des Zeiteintrags')
      }

      return response.data.entry
    } catch (error: any) {
      console.error('Fehler beim Laden des Zeiteintrags:', error)
      
      if (error.error) {
        throw new Error(error.error)
      }
      
      throw new Error('Zeiteintrag konnte nicht geladen werden')
    }
  }

  /**
   * Holt Multi-Monats-Statistiken
   * KORRIGIERT: Response-Struktur richtig verarbeiten
   */
  static async getMultiMonthStats(months: number = 12): Promise<any> {
    try {
      const response = await apiClient.get(`/api/timetracking/stats/multi-month?months=${months}`)
      
      // ✅ KORRIGIERT: response ist bereits das data-Objekt
      if (!response.success) {
        throw new Error(response.error || 'Fehler beim Laden der Statistiken')
      }

      return response.data
    } catch (error: any) {
      console.error('Fehler beim Laden der Statistiken:', error)
      
      if (error.error) {
        throw new Error(error.error)
      }
      
      throw new Error('Statistiken konnten nicht geladen werden')
    }
  }
}

export { TimeTrackingService }
export default TimeTrackingService