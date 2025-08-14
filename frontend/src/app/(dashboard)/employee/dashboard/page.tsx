// ✅ ÄNDERUNGEN:
// 1. currentPeriodData State entfernt
// 2. Alle Summary Cards verwenden monthlyData
// 3. loadCurrentPeriodData() Aufrufe entfernt
// 4. loadCurrentPeriodData() Funktion entfernt

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { TimeTrackingService } from '@/lib/timetracking'
import type {
  TimeRecord,
  MonthlyTimeRecords,
  CreateTimeRecordRequest,
  UpdateTimeRecordRequest,
  BillingPeriod
} from '@/lib/timetracking'

interface FormData extends CreateTimeRecordRequest { }
interface EditFormData extends UpdateTimeRecordRequest { }

export default function EmployeeDashboard() {
  const { user } = useAuth()
  const [monthlyData, setMonthlyData] = useState<MonthlyTimeRecords | null>(null)
  // ✅ ENTFERNT: currentPeriodData State nicht mehr nötig
  const [currentMonth, setCurrentMonth] = useState<string>('')  // ✅ Leer lassen, wird vom Backend gesetzt
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null)
  const [availablePeriods, setAvailablePeriods] = useState<BillingPeriod[]>([])

  const [formData, setFormData] = useState<FormData>({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    description: ''
  })

  const [editFormData, setEditFormData] = useState<EditFormData>({
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0,
    description: ''
  })

  useEffect(() => {
    if (user?.id) {
      loadMonthlyData()
      loadBillingPeriods() // Zuerst Perioden laden
    }
  }, [currentMonth, user?.id])

  // ✅ ENTFERNT: useEffect für currentPeriodData

  const loadMonthlyData = async () => {
    if (!user?.id || !currentMonth) return  // ✅ Prüfe auch ob currentMonth gesetzt ist

    try {
      setLoading(true)
      setError('')

      console.log(`📅 Lade Daten für Periode: ${currentMonth}`)

      // Neue API-Struktur: userId, year, month
      const [yearStr, monthStr] = currentMonth.split('-')
      const year = parseInt(yearStr)
      const month = parseInt(monthStr)

      const data = await TimeTrackingService.getMonthlyTimeRecords(user.id, year, month)
      setMonthlyData(data)

      console.log(`📅 Daten geladen für Periode:`, data.period)
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Zeitdaten')
      console.error('Error loading monthly data:', err)
    } finally {
      setLoading(false)
    }
  }

  // ✅ ENTFERNT: loadCurrentPeriodData() Funktion nicht mehr nötig

  const loadBillingPeriods = async () => {
    if (!user?.id) return

    try {
      // ✅ KORRIGIERT: Backend-API verwenden für benutzerdefinierte Abrechnungsperioden
      const periods = await TimeTrackingService.getBillingPeriods()
      setAvailablePeriods(periods)

      console.log('📅 DEBUG: Alle geladenen Perioden:')
      periods.forEach((period, index) => {
        console.log(`  ${index}: Label="${period.label}" | Value="${period.value}" | isCurrent=${period.isCurrent}`)
        console.log(`       StartDate=${period.startDate} | EndDate=${period.endDate}`)
      })

      // ✅ KORRIGIERT: Nur setzen wenn currentMonth noch leer ist (beim ersten Laden)
      const currentPeriod = periods.find(p => p.isCurrent)
      if (currentPeriod && !currentMonth) {  // ← NUR wenn currentMonth leer ist!
        console.log(`📅 Setze aktuelle Periode beim ersten Laden: ${currentPeriod.value} (${currentPeriod.label})`)
        setCurrentMonth(currentPeriod.value)
      } else if (currentMonth) {
        console.log(`📅 Behalte Benutzerauswahl bei: ${currentMonth}`)
      }

    } catch (err) {
      console.error('Error loading billing periods:', err)

      // Fallback: Standard-Kalenderperioden generieren
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

      setAvailablePeriods(periods)

      // ✅ KORRIGIERT: Auch hier nur beim ersten Laden setzen
      if (!currentMonth && periods.length > 0) {
        setCurrentMonth(periods[0].value)
      }
    }
  }

  const handleCreateRecord = async () => {
    try {
      // Validate form data - Pausenzeit auf 0 setzen
      const processedFormData = { ...formData, breakMinutes: 0 }
      const validation = TimeTrackingService.validateTimeEntry(processedFormData)
      if (!validation.isValid) {
        setError(validation.errors.join(', '))
        return
      }

      await TimeTrackingService.createTimeRecord(processedFormData)
      await loadMonthlyData() // ✅ Nur noch diese eine Funktion
      setShowAddForm(false)
      resetForm()
      setError('')
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen des Zeiteintrags')
    }
  }

  const handleEditRecord = (record: TimeRecord) => {
    setEditingRecord(record)
    setEditFormData({
      startTime: record.startTime,
      endTime: record.endTime,
      breakMinutes: 0, // Pausenzeit deaktiviert
      description: record.description || ''
    })
  }

  const handleSaveEdit = async () => {
    if (!editingRecord) return

    try {
      await TimeTrackingService.updateTimeRecord(editingRecord.id, editFormData)
      await loadMonthlyData()  // ✅ Nur noch diese eine Funktion
      setEditingRecord(null)
      setError('')
    } catch (err: any) {
      setError(err.message || 'Fehler beim Aktualisieren des Zeiteintrags')
    }
  }

  const handleDeleteRecord = async (id: number) => {
    if (!confirm('Möchten Sie diesen Zeiteintrag wirklich löschen?')) return

    try {
      await TimeTrackingService.deleteTimeRecord(id)
      await loadMonthlyData()  // ✅ Nur noch diese eine Funktion
      setError('')
    } catch (err: any) {
      setError(err.message || 'Fehler beim Löschen des Zeiteintrags')
    }
  }

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 0, // Pausenzeit deaktiviert
      description: ''
    })
  }

  const handleMonthChange = (newMonth: string) => {
    console.log(`🔍 DEBUG: User wählte Monat: ${newMonth}`)

    // Zeige Details der gewählten Periode
    const selectedPeriod = availablePeriods.find(p => p.value === newMonth)
    if (selectedPeriod) {
      console.log(`📅 DEBUG: Gewählte Periode:`)
      console.log(`  Label: ${selectedPeriod.label}`)
      console.log(`  Value: ${selectedPeriod.value}`)
      console.log(`  StartDate: ${selectedPeriod.startDate}`)
      console.log(`  EndDate: ${selectedPeriod.endDate}`)
    }

    setCurrentMonth(newMonth)
  }

  if (loading && !monthlyData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Dashboard wird geladen...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Zeiterfassung</h1>
        <p className="text-slate-600 mt-2">
          Willkommen, {user?.name}! Verwalten Sie hier Ihre Arbeitszeiten.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* ✅ KORRIGIERT: Summary Cards - alle verwenden jetzt monthlyData */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* ✅ KORRIGIERT: Arbeitszeit verwendet jetzt monthlyData statt currentPeriodData */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-6">Arbeitszeit (Periode)</h3>
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">
              {monthlyData?.summary?.totalHours?.toFixed(1) || '0.0'}h
            </div>
            {monthlyData?.period && (
              <p className="text-sm text-slate-500">
                {monthlyData.period.monthName} {monthlyData.period.year}
              </p>
            )}
          </div>
        </div>

        {/* Verdienst (nur diese Periode) */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-6">Verdienst (Periode)</h3>
          <div className="text-center">
            <div className={`text-4xl font-bold mb-2 ${(monthlyData?.summary?.totalEarnings || 0) > (monthlyData?.summary?.minijobLimit || 0)
              ? 'text-orange-600'
              : 'text-green-600'
              }`}>
              {monthlyData?.summary?.totalEarnings?.toFixed(2) || '0.00'} €
            </div>
            {(monthlyData?.summary?.totalEarnings || 0) > (monthlyData?.summary?.minijobLimit || 0) && (
              <p className="text-sm text-orange-600 font-medium">
                Limit von {monthlyData?.summary?.minijobLimit?.toFixed(2) || '0.00'} € überschritten!
              </p>
            )}
          </div>
        </div>

        {/* Kontostand */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Kontostand</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Verdienst (aktueller Monat):</span>
              <span className="font-medium">{monthlyData?.summary?.totalEarnings?.toFixed(2) || '0.00'} €</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Übertrag aus Vormonat:</span>
              <span className="font-medium">{monthlyData?.summary?.carryIn?.toFixed(2) || '0.00'} €</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Auszahlung (aktueller Monat):</span>
              <span className="font-medium">{monthlyData?.summary?.paidThisMonth?.toFixed(2) || '0.00'} €</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Übertrag in kommenden Monat:</span>
              <span className="font-medium">{monthlyData?.summary?.carryOut?.toFixed(2) || '0.00'} €</span>
            </div>
          </div>
        </div>
      </div>

      {/* Time Records Table */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {/* Table Header mit Periodenauswahl rechts */}
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-slate-900">
                Zeiteinträge
              </h3>
              {monthlyData && (
                <p className="text-sm text-slate-500 mt-1">
                  {monthlyData.period?.monthName} {monthlyData.period?.year}
                </p>
              )}
            </div>

            {/* Rechte Seite: Periodenauswahl + Button */}
            <div className="flex items-center space-x-4">
              {/* Periodenauswahl */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-slate-700">Abrechnungsperiode:</label>
                <select
                  value={currentMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="block w-40 pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  {availablePeriods.map(period => (
                    <option key={period.value} value={period.value}>
                      {period.label}  {/* ✅ Zeigt vollständige Abrechnungsperioden-Info */}
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Button */}
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Neue Arbeitszeit erfassen</span>
              </button>
            </div>
          </div>
        </div>

        {/* Rest des Codes bleibt gleich... */}
        {/* Add Form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Datum</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Startzeit</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Endzeit</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Beschreibung</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-end space-x-2">
                <button
                  onClick={handleCreateRecord}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                >
                  Speichern
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="bg-slate-500 text-white px-4 py-2 rounded-md hover:bg-slate-600 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table Content */}
        {!monthlyData?.records?.length ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-slate-500">Noch keine Zeiteinträge für diesen Monat.</p>
            <p className="text-slate-400 text-sm mt-1">Erstellen Sie Ihren ersten Eintrag mit dem Button oben.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Datum</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Zeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Arbeitszeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Verdienst</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Beschreibung</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {monthlyData.records.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {new Date(record.date).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {editingRecord?.id === record.id ? (
                        <div className="flex space-x-2">
                          <input
                            type="time"
                            value={editFormData.startTime}
                            onChange={(e) => setEditFormData({ ...editFormData, startTime: e.target.value })}
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-xs"
                          />
                          <span>-</span>
                          <input
                            type="time"
                            value={editFormData.endTime}
                            onChange={(e) => setEditFormData({ ...editFormData, endTime: e.target.value })}
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-xs"
                          />
                        </div>
                      ) : (
                        `${record.startTime} - ${record.endTime}`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-900">{record.workTime}</span>
                      <span className="text-xs text-slate-500 block">{record.totalHours}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {record.formattedEarnings}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">
                      {editingRecord?.id === record.id ? (
                        <input
                          type="text"
                          value={editFormData.description}
                          onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                          placeholder="Beschreibung..."
                        />
                      ) : (
                        record.description || '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingRecord?.id === record.id ? (
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={handleSaveEdit}
                            className="text-green-600 hover:text-green-900"
                          >
                            Speichern
                          </button>
                          <button
                            onClick={() => setEditingRecord(null)}
                            className="text-slate-600 hover:text-slate-900"
                          >
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEditRecord(record)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(record.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Löschen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}