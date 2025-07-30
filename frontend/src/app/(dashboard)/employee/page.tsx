'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { authManager, useAuth } from '@/lib/auth'

export default function EmployeeDashboard() {
  const { handleSessionExpired } = useAuth()
  const [currentUser, setCurrentUser] = useState(null)
  const [currentMinijobSetting, setCurrentMinijobSetting] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    setCurrentUser(user)
    loadCurrentMinijobSetting()
  }, [])

  const loadCurrentMinijobSetting = async () => {
    try {
      const response = await authManager.authenticatedFetch('http://localhost:5000/api/employee/minijob/current')
      const data = await response.json()

      if (response.ok && data.success) {
        setCurrentMinijobSetting(data.data.setting)
      } else {
        console.log('Keine aktuelle Minijob-Einstellung gefunden')
      }
    } catch (error) {
      if (error.message === 'SESSION_EXPIRED') {
        handleSessionExpired()
      } else {
        console.error('Fehler beim Laden der Minijob-Einstellung:', error)
      }
    } finally {
      setLoading(false)
    }
  }

  const testProtectedRoute = async () => {
    try {
      const response = await authManager.authenticatedFetch('http://localhost:5000/api/auth/profile')
      const data = await response.json()

      if (response.ok && data.success) {
        setMessage(`✅ Profil erfolgreich geladen: ${JSON.stringify(data.data, null, 2)}`)
      } else {
        setMessage(`❌ Fehler: ${data.error}`)
      }
    } catch (error) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ Fehler beim Laden des Profils')
      }
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Kein Datum'
    return new Date(dateString + 'T12:00:00').toLocaleDateString('de-DE')
  }

  if (loading) {
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
      {/* Welcome Section */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Willkommen, {currentUser?.name}
            </h2>
            <p className="text-slate-600 mt-1">
              Schön, Sie im Portal zu sehen!
            </p>
          </div>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Information */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            Ihre Informationen
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-600 font-medium">Name:</span>
              <span className="text-slate-800">{currentUser?.name || 'Nicht verfügbar'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-medium">E-Mail:</span>
              <span className="text-slate-800 break-all">{currentUser?.email || 'Nicht verfügbar'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-medium">Rolle:</span>
              <span className="text-slate-800">Mitarbeiter</span>
            </div>
          </div>
          
          <div className="mt-6">
            <Link
              href="/employee/settings"
              className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Einstellungen verwalten
            </Link>
          </div>
        </div>

        {/* Current Minijob Setting */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <div className="w-8 h-8 bg-green-200 rounded-full flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </div>
            Aktuelles Minijob-Limit
          </h3>

          {currentMinijobSetting ? (
            <div className="space-y-3">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-800">
                    {formatCurrency(currentMinijobSetting.monthlyLimit)}
                  </div>
                  <div className="text-sm text-green-600">Monatliches Limit</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Beschreibung:</span>
                  <span className="text-slate-800 text-right max-w-48">{currentMinijobSetting.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Gültig ab:</span>
                  <span className="text-slate-800">{formatDate(currentMinijobSetting.validFrom)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Gültig bis:</span>
                  <span className="text-slate-800">
                    {currentMinijobSetting.validUntil ? formatDate(currentMinijobSetting.validUntil) : 'Unbegrenzt'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 bg-yellow-50 rounded-lg border border-yellow-200">
              <svg className="w-12 h-12 text-yellow-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h4 className="text-lg font-medium text-yellow-800 mb-2">Kein Minijob-Limit festgelegt</h4>
              <p className="text-yellow-700">Wenden Sie sich an einen Administrator</p>
            </div>
          )}
        </div>
      </div>

      {/* System Test */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mt-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">System-Test</h3>
        <button
          onClick={testProtectedRoute}
          className="bg-slate-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-slate-800 transition-colors flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          Geschützte Daten abrufen
        </button>

        {message && (
          <div className="mt-4 p-4 bg-slate-100 border border-slate-200 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono">{message}</pre>
          </div>
        )}
      </div>
    </div>
  )
}