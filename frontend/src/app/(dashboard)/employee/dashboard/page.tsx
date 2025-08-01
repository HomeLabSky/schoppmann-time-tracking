'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import TimeTrackingService from '@/lib/timetracking'
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
  const [currentMonth, setCurrentMonth] = useState<string>(TimeTrackingService.getCurrentMonth())
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
    breakMinutes: 0,
    description: ''
  })
  const [formData, setFormData] = useState<CreateTimeRecordRequest>({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    description: ''
  })

  // Load data on component mount and month change
  useEffect(() => {
    loadMonthlyData()
    loadBillingPeriods()
  }, [currentMonth])

  const loadMonthlyData = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await TimeTrackingService.getMonthlyTimeRecords(currentMonth)
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
      const { periods } = await TimeTrackingService.getBillingPeriods()
      setAvailablePeriods(periods)
    } catch (err) {
      console.error('Error loading billing periods:', err)
    }
  }

  const handleCreateRecord = async () => {
    try {
      // Validate form data
      const validation = TimeTrackingService.validateTimeRecord(formData)
      if (!validation.isValid) {
        setError(validation.errors.join(', '))
        return
      }

      await TimeTrackingService.createTimeRecord(formData)
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
      breakMinutes: record.breakMinutes,
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
      breakMinutes: 30,
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

      {/* Month Navigation & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Month Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Abrechnungsperiode</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleMonthChange(TimeTrackingService.getPreviousMonth(currentMonth))}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <select
              value={currentMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="flex-1 min-w-0 block w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {availablePeriods.map(period => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleMonthChange(TimeTrackingService.getNextMonth(currentMonth))}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {/* Monthly Summary */}
        {monthlyData && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-medium text-slate-900 mb-4">Arbeitszeit</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Gesamtstunden:</span>
                  <span className="font-medium">{monthlyData.summary.totalHours.toFixed(2)}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Einträge:</span>
                  <span className="font-medium">{monthlyData.summary.entryCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Stundenlohn:</span>
                  <span className="font-medium">{TimeTrackingService.formatCurrency(monthlyData.summary.hourlyRate)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-medium text-slate-900 mb-4">Minijob-Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Verdient:</span>
                  <span className="font-medium">{TimeTrackingService.formatCurrency(monthlyData.summary.totalEarnings)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Limit:</span>
                  <span className="font-medium">{TimeTrackingService.formatCurrency(monthlyData.summary.minijobLimit)}</span>
                </div>
                {monthlyData.summary.exceedsLimit && (
                  <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
                    <p className="text-orange-800 text-sm">
                      ⚠️ Limit überschritten! {TimeTrackingService.formatCurrency(monthlyData.summary.carryOut)} werden übertragen.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add New Entry Button */}
      <div className="mb-6">
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

      {/* Add Entry Form */}
      {showAddForm && (
        <div className="mb-8 bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Neue Arbeitszeit</h3>
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pause (Min.)</label>
              <input
                type="number"
                min="0"
                max="480"
                value={formData.breakMinutes}
                onChange={(e) => setFormData({ ...formData, breakMinutes: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
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

      {/* Time Records Table */}
      {monthlyData && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-medium text-slate-900">
              Zeiteinträge für {monthlyData.period.monthName} {monthlyData.period.year}
            </h3>
          </div>
          
          {monthlyData.records.length === 0 ? (
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Pause</th>
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
                        {TimeTrackingService.formatDate(record.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {TimeTrackingService.formatTime(record.startTime)} - {TimeTrackingService.formatTime(record.endTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {record.breakMinutes}min
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                        {record.workTime}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                        {record.formattedEarnings}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        <div className="max-w-32 truncate" title={record.description}>
                          {record.description || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEditRecord(record)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Bearbeiten"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(record.id)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Löschen"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-slate-900 mb-4">Zeiteintrag bearbeiten</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Datum</label>
                <input
                  type="date"
                  value={editingRecord.date}
                  disabled
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-50 text-slate-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Startzeit</label>
                  <input
                    type="time"
                    value={editFormData.startTime}
                    onChange={(e) => setEditFormData({ ...editFormData, startTime: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Endzeit</label>
                  <input
                    type="time"
                    value={editFormData.endTime}
                    onChange={(e) => setEditFormData({ ...editFormData, endTime: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pause (Minuten)</label>
                <input
                  type="number"
                  min="0"
                  max="480"
                  value={editFormData.breakMinutes}
                  onChange={(e) => setEditFormData({ ...editFormData, breakMinutes: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Beschreibung</label>
                <input
                  type="text"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 text-slate-700 bg-slate-200 rounded-md hover:bg-slate-300 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
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