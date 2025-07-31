// frontend/src/app/(dashboard)/admin/minijob/page.tsx

'use client'

import { useState, useEffect } from 'react'
import { authManager, useAuth } from '@/lib/auth'

// TypeScript Interfaces
interface MinijobSetting {
  id: number
  monthlyLimit: number
  description: string
  validFrom: string
  validUntil: string | null
  isActive: boolean
  createdAt: string
  Creator?: {
    name: string
    email: string
  }
}

interface NewMinijobSetting {
  monthlyLimit: string
  description: string
  validFrom: string
  validUntil: string
}

interface AutoAdjustedSetting {
  id: number
  description: string
  oldValidUntil: string
  newValidUntil: string
}

export default function MinijobSettingsPage() {
  const { handleSessionExpired } = useAuth()

  // States
  const [settings, setSettings] = useState<MinijobSetting[]>([])
  const [currentSetting, setCurrentSetting] = useState<MinijobSetting | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [message, setMessage] = useState('')

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingSetting, setEditingSetting] = useState<MinijobSetting | null>(null)
  const [loadingAction, setLoadingAction] = useState(false)

  // Form State
  const [newSettingForm, setNewSettingForm] = useState<NewMinijobSetting>({
    monthlyLimit: '',
    description: '',
    validFrom: '',
    validUntil: ''
  })

  // Auto-Adjustment Info
  const [autoAdjustmentInfo, setAutoAdjustmentInfo] = useState<AutoAdjustedSetting[]>([])
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)

  useEffect(() => {
    loadMinijobSettings()
    loadCurrentSetting()
  }, [])

  // Alle Minijob-Einstellungen laden
  const loadMinijobSettings = async () => {
    setLoadingSettings(true)
    setMessage('')

    try {
      const response = await authManager.authenticatedFetch('http://localhost:5000/api/admin/minijob-settings')
      const data = await response.json()

      if (response.ok) {
        setSettings(data.settings || [])
        setMessage(`✅ ${data.total || 0} Minijob-Einstellungen geladen`)
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error: any) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ Fehler beim Laden der Minijob-Einstellungen')
      }
    } finally {
      setLoadingSettings(false)
      setLoading(false)
    }
  }

  // Aktuelle Minijob-Einstellung laden
  const loadCurrentSetting = async () => {
    try {
      const response = await authManager.authenticatedFetch('http://localhost:5000/api/admin/minijob-settings/current')
      const data = await response.json()

      if (response.ok) {
        setCurrentSetting(data.setting)
      } else if (response.status === 404) {
        setCurrentSetting(null)
      }
    } catch (error: any) {
      console.error('Fehler beim Laden der aktuellen Einstellung:', error)
    }
  }

  // Neue Einstellung erstellen
  const createNewSetting = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingAction(true)
    setMessage('')
    setAutoAdjustmentInfo([])

    try {
      const requestData = {
        monthlyLimit: newSettingForm.monthlyLimit,
        description: newSettingForm.description,
        validFrom: newSettingForm.validFrom,
        ...(newSettingForm.validUntil && { validUntil: newSettingForm.validUntil })
      }

      const response = await authManager.authenticatedFetch('http://localhost:5000/api/admin/minijob-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)

        // Info über automatische Anpassungen anzeigen
        if (data.autoAdjustedSettings && data.autoAdjustedSettings.length > 0) {
          setAutoAdjustmentInfo(data.autoAdjustedSettings)
        }

        setNewSettingForm({ monthlyLimit: '', description: '', validFrom: '', validUntil: '' })
        setShowCreateModal(false)
        setShowAdvancedOptions(false)
        loadMinijobSettings()
        loadCurrentSetting()
      } else {
        if (data.details) {
          setMessage(`❌ ${data.details.join(', ')}`)
        } else {
          setMessage(`❌ ${data.error}`)
        }
      }
    } catch (error: any) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ Verbindungsfehler beim Erstellen der Einstellung')
      }
    } finally {
      setLoadingAction(false)
    }
  }

  // Einstellung bearbeiten vorbereiten
  const openEditSetting = (setting: MinijobSetting) => {
    setEditingSetting(setting)
    setNewSettingForm({
      monthlyLimit: setting.monthlyLimit.toString(),
      description: setting.description,
      validFrom: setting.validFrom,
      validUntil: setting.validUntil || ''
    })
    setShowEditModal(true)
  }

  // Einstellung aktualisieren
  const updateSetting = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSetting) return

    setLoadingAction(true)
    setMessage('')

    try {
      const requestData = {
        monthlyLimit: newSettingForm.monthlyLimit,
        description: newSettingForm.description,
        validFrom: newSettingForm.validFrom,
        ...(newSettingForm.validUntil && { validUntil: newSettingForm.validUntil })
      }

      const response = await authManager.authenticatedFetch(`http://localhost:5000/api/admin/minijob-settings/${editingSetting.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)
        setShowEditModal(false)
        setEditingSetting(null)
        loadMinijobSettings()
        loadCurrentSetting()
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error: any) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ Verbindungsfehler beim Aktualisieren der Einstellung')
      }
    } finally {
      setLoadingAction(false)
    }
  }

  // Einstellung löschen
  const deleteSetting = async (settingId: number) => {
    if (!confirm('Sind Sie sicher, dass Sie diese Einstellung löschen möchten?\n\nVorherige Einstellungen werden automatisch angepasst.')) return

    setLoadingAction(true)
    setMessage('')
    setAutoAdjustmentInfo([])

    try {
      const response = await authManager.authenticatedFetch(`http://localhost:5000/api/admin/minijob-settings/${settingId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)

        if (data.adjustedSettings && data.adjustedSettings.length > 0) {
          setAutoAdjustmentInfo(data.adjustedSettings.map((adj: any) => ({
            id: adj.id,
            description: adj.description,
            oldValidUntil: adj.oldValidUntil,
            newValidUntil: adj.newValidUntil
          })))
        }

        loadMinijobSettings()
        loadCurrentSetting()
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error: any) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ Verbindungsfehler beim Löschen der Einstellung')
      }
    } finally {
      setLoadingAction(false)
    }
  }

  // Zeiträume neu berechnen
  const recalculatePeriods = async () => {
    if (!confirm('Alle Minijob-Zeiträume neu berechnen?\n\nDies korrigiert eventuelle Inkonsistenzen in den Gültigkeitszeiträumen.')) return

    setLoadingAction(true)
    setMessage('')

    try {
      const response = await authManager.authenticatedFetch('http://localhost:5000/api/admin/minijob-settings/recalculate-periods', {
        method: 'POST'
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)

        if (data.adjustments && data.adjustments.length > 0) {
          setAutoAdjustmentInfo(data.adjustments.map((adj: any) => ({
            id: adj.id,
            description: adj.description,
            oldValidUntil: adj.oldValidUntil,
            newValidUntil: adj.newValidUntil
          })))
        }

        loadMinijobSettings()
        loadCurrentSetting()
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error: any) {
      setMessage('❌ Fehler bei der Neuberechnung')
    } finally {
      setLoadingAction(false)
    }
  }

  // Hilfsfunktionen
  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T12:00:00').toLocaleDateString('de-DE')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }

  const getStatusBadge = (setting: MinijobSetting) => {
    const today = new Date().toISOString().split('T')[0]

    if (setting.isActive) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Aktiv</span>
    } else if (setting.validFrom > today) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Zukünftig</span>
    } else {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Vergangen</span>
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">Lade Minijob-Einstellungen...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Minijob-Einstellungen</h2>
            <p className="text-sm text-gray-500 mt-1">
              Verwalten Sie Minijob-Limits und Gültigkeitszeiträume
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={recalculatePeriods}
              disabled={loadingAction}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loadingAction ? 'Berechne...' : 'Neu berechnen'}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Neue Einstellung
            </button>
          </div>
        </div>
      </div>

      {/* Current Setting Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Aktuelle Einstellung</h3>
        </div>

        {currentSetting ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-blue-600 mb-1">Monatliches Limit</p>
              <p className="text-2xl font-bold text-blue-900">{formatCurrency(currentSetting.monthlyLimit)}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-600 mb-1">Beschreibung</p>
              <p className="font-semibold text-gray-900">{currentSetting.description}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-600 mb-1">Gültig ab</p>
              <p className="font-semibold text-gray-900">{formatDate(currentSetting.validFrom)}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-600 mb-1">Gültig bis</p>
              <p className="font-semibold text-gray-900">{currentSetting.validUntil ? formatDate(currentSetting.validUntil) : 'Unbegrenzt'}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-yellow-50 rounded-lg border border-yellow-200">
            <svg className="w-12 h-12 text-yellow-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h4 className="text-lg font-medium text-yellow-800 mb-2">Keine aktuelle Einstellung gefunden</h4>
            <p className="text-yellow-700 mb-4">Bitte erstellen Sie eine neue Minijob-Einstellung</p>
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Neue Einstellung erstellen
            </button>
          </div>
        )}
      </div>

      {/* Auto-Adjustment Info */}
      {autoAdjustmentInfo.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Automatische Anpassung durchgeführt</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Die folgenden Einstellungen wurden automatisch angepasst:</p>
                <ul className="mt-2 space-y-2">
                  {autoAdjustmentInfo.map((adj, index) => (
                    <li key={index} className="flex items-start bg-white p-3 rounded border border-blue-100">
                      <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-blue-400 mt-2 mr-3"></span>
                      <div className="flex-1">
                        <div className="font-medium text-blue-900">{adj.description}</div>
                        <div className="text-blue-600 text-xs mt-1">
                          <span className="inline-flex items-center">
                            <span className="mr-2">Gültigkeit:</span>
                            <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded">{adj.oldValidUntil}</span>
                            <svg className="w-3 h-3 mx-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">{adj.newValidUntil}</span>
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => setAutoAdjustmentInfo([])}
                className="mt-3 text-sm text-blue-800 hover:text-blue-900 font-medium underline"
              >
                Ausblenden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Alle Einstellungen ({settings?.length || 0})</h3>
        </div>

        {loadingSettings ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Lade Einstellungen...</p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Limit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Beschreibung</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gültigkeitszeitraum</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Erstellt von</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {settings && settings.map((setting) => (
                  <tr key={setting.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{formatCurrency(setting.monthlyLimit)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs">{setting.description}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div>{formatDate(setting.validFrom)}</div>
                        <div className="text-gray-500">bis {setting.validUntil ? formatDate(setting.validUntil) : 'unbegrenzt'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(setting)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{setting.Creator?.name || 'Unbekannt'}</div>
                      <div className="text-sm text-gray-500">{setting.Creator?.email || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => openEditSetting(setting)} 
                          className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded transition-colors" 
                          title="Bearbeiten"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {!setting.isActive && setting.validFrom > new Date().toISOString().split('T')[0] && (
                          <button 
                            onClick={() => deleteSetting(setting.id)} 
                            className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded transition-colors" 
                            title="Löschen" 
                            disabled={loadingAction}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!settings || settings.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      Noch keine Minijob-Einstellungen vorhanden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== MODALS ===== */}

      {/* Create Setting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Neue Minijob-Einstellung</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={createNewSetting} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monatliches Limit (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="999999.99"
                  value={newSettingForm.monthlyLimit}
                  onChange={(e) => setNewSettingForm({ ...newSettingForm, monthlyLimit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                  placeholder="z.B. 600.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Beschreibung</label>
                <input
                  type="text"
                  value={newSettingForm.description}
                  onChange={(e) => setNewSettingForm({ ...newSettingForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                  placeholder="z.B. Neue gesetzliche Minijob-Grenze 2026"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gültig ab</label>
                <input
                  type="date"
                  value={newSettingForm.validFrom}
                  onChange={(e) => setNewSettingForm({ ...newSettingForm, validFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              {/* Erweiterte Optionen */}
              <div className="pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="flex items-center text-sm text-gray-600 hover:text-gray-900 font-medium"
                >
                  <svg className={`w-4 h-4 mr-2 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  Erweiterte Optionen
                </button>
              </div>

              {showAdvancedOptions && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Gültig bis (optional)
                      <span className="text-xs text-gray-500 ml-2">Leer lassen für unbegrenzte Gültigkeit</span>
                    </label>
                    <input
                      type="date"
                      value={newSettingForm.validUntil}
                      onChange={(e) => setNewSettingForm({ ...newSettingForm, validUntil: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                      min={newSettingForm.validFrom}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Empfehlung: Leer lassen, da zukünftige Änderungen automatisch angepasst werden
                    </p>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={loadingAction}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {loadingAction ? 'Erstelle...' : 'Einstellung erstellen'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 font-medium transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Setting Modal */}
      {showEditModal && editingSetting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Einstellung bearbeiten</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={updateSetting} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monatliches Limit (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="999999.99"
                  value={newSettingForm.monthlyLimit}
                  onChange={(e) => setNewSettingForm({ ...newSettingForm, monthlyLimit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Beschreibung</label>
                <input
                  type="text"
                  value={newSettingForm.description}
                  onChange={(e) => setNewSettingForm({ ...newSettingForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gültig ab</label>
                  <input
                    type="date"
                    value={newSettingForm.validFrom}
                    onChange={(e) => setNewSettingForm({ ...newSettingForm, validFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gültig bis (optional)
                    <span className="text-xs text-gray-500 block">Leer = unbegrenzt</span>
                  </label>
                  <input
                    type="date"
                    value={newSettingForm.validUntil}
                    onChange={(e) => setNewSettingForm({ ...newSettingForm, validUntil: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    min={newSettingForm.validFrom}
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={loadingAction}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {loadingAction ? 'Aktualisiere...' : 'Aktualisieren'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 font-medium transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Messages */}
      {message && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg max-w-md border z-50 ${message.includes('✅')
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}