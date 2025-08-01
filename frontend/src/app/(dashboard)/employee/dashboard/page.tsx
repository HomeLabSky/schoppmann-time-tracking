'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { TimeTrackingService } from '@/lib/timetracking'
import type { 
  TimeRecord, 
  TimeRecordSummary, 
  BillingPeriod, 
  MonthlyTimeRecords,
  CreateTimeRecordRequest 
} from '@/lib/timetracking'

export default function EmployeeDashboard() {
  const { user } = useAuth()
  
  // State Management
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [monthlyData, setMonthlyData] = useState<MonthlyTimeRecords | null>(null)
  const [availablePeriods, setAvailablePeriods] = useState<BillingPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  
  // Form States
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<TimeRecord | null>(null)
  // Edit form state
  const [editFormData, setEditFormData] = useState({
    startTime: '',
    endTime: '',
    breakMinutes: 0, // Pausenzeit deaktiviert
    description: ''
  })
  const [formData, setFormData] = useState<CreateTimeRecordRequest>({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 0, // Pausenzeit deaktiviert
    description: ''
  })

  // Load data on component mount and month change
  useEffect(() => {
    if (user?.userId) {
      loadMonthlyData()
      loadBillingPeriods()
    }
  }, [currentMonth, user?.userId])

  const loadMonthlyData = async () => {
    if (!user?.userId) return
    
    try {
      setLoading(true)
      setError('')
      
      // Neue API-Struktur: userId, year, month
      const [yearStr, monthStr] = currentMonth.split('-')
      const year = parseInt(yearStr)
      const month = parseInt(monthStr)
      
      const data = await TimeTrackingService.getMonthlyTimeRecords(user.userId, year, month)
      setMonthlyData(data)
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Zeitdaten')
      console.error('Error loading monthly data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadBillingPeriods = async () => {
    try {
      // Nur die letzten 6 Monate generieren
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
    } catch (err) {
      console.error('Error loading billing periods:', err)
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
      await loadMonthlyData() // Refresh data
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
      await loadMonthlyData()
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
      await loadMonthlyData()
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

      {/* Summary Cards - mit Übertrag-Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Arbeitszeit */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Arbeitszeit</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Gesamtstunden:</span>
              <span className="font-medium">{monthlyData?.summary?.totalHours?.toFixed(2) || '0.00'}h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Einträge:</span>
              <span className="font-medium">{monthlyData?.summary?.entryCount || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Stundenlohn:</span>
              <span className="font-medium">{monthlyData?.summary?.hourlyRate?.toFixed(2) || '0.00'} €</span>
            </div>
          </div>
        </div>

        {/* Verdienst (nur diese Periode) */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Verdienst (Periode)</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Verdient:</span>
              <span className="font-medium">{monthlyData?.summary?.totalEarnings?.toFixed(2) || '0.00'} €</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Limit:</span>
              <span className="font-medium">{monthlyData?.summary?.minijobLimit?.toFixed(2) || '0.00'} €</span>
            </div>
          </div>
        </div>

        {/* Gesamtverdienst (mit Übertrag) */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Gesamtverdienst</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Total (inkl. Übertrag):</span>
              <span className="font-medium">{monthlyData?.summary?.actualEarnings?.toFixed(2) || '0.00'} €</span>
            </div>
            {monthlyData?.summary?.carryIn && monthlyData.summary.carryIn > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Übertrag aus Vormonat:</span>
                <span className="text-slate-600">+{monthlyData.summary.carryIn.toFixed(2)} €</span>
              </div>
            )}
            {monthlyData?.summary?.carryOut && monthlyData.summary.carryOut > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Übertrag für nächsten Monat:</span>
                <span className="text-slate-600">{monthlyData.summary.carryOut.toFixed(2)} €</span>
              </div>
            )}
            {monthlyData?.summary?.exceedsLimit && (
              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                <p className="text-orange-800 text-sm">
                  ⚠️ Limit überschritten!
                </p>
              </div>
            )}
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
                      {period.label}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Add Button */}
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                <span>Neue Arbeitszeit erfassen</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Add Entry Form */}
        {showAddForm && (
          <div className="bg-gray-50 px-6 py-4 border-b border-slate-200">
            <h4 className="text-md font-medium text-slate-900 mb-3">Neue Arbeitszeit</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Datum</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Startzeit</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Endzeit</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {/* Pausenzeit-Feld entfernt */}
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Aktionen</label>
                <div className="flex space-x-2">
                  <button
                    onClick={handleCreateRecord}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
                  >
                    Speichern
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false)
                      resetForm()
                    }}
                    className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
              <div className="md:col-span-2 lg:col-span-5">
                <label className="block text-sm font-medium text-slate-700 mb-1">Beschreibung (optional)</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Beschreibung der Tätigkeit..."
                  maxLength={500}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
        
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
                  {/* Pausenzeit-Spalte entfernt */}
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Arbeitszeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Verdienst</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Beschreibung</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {monthlyData.records
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {new Date(record.date).toLocaleDateString('de-DE', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {record.startTime} - {record.endTime}
                    </td>
                    {/* Pausenzeit-Spalte entfernt */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {record.workTime}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {record.formattedEarnings}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 max-w-xs truncate">
                      {record.description || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditRecord(record)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-slate-900 mb-4">Zeiteintrag bearbeiten</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Startzeit</label>
                  <input
                    type="time"
                    value={editFormData.startTime}
                    onChange={(e) => setEditFormData({ ...editFormData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Endzeit</label>
                  <input
                    type="time"
                    value={editFormData.endTime}
                    onChange={(e) => setEditFormData({ ...editFormData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Pausenzeit-Feld entfernt */}
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Beschreibung (optional)</label>
                <textarea
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Beschreibung der Tätigkeit..."
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}