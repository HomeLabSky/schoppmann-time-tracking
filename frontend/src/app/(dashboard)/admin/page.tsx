'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authManager, useAuth } from '@/lib/auth'
import type { 
  User, 
  MinijobSetting, 
  UsersResponse, 
  CurrentMinijobSettingResponse 
} from '@/types/api'

// Lokale Interfaces für Dashboard-spezifische Daten
interface DashboardStats {
  totalUsers: number
  activeUsers: number
  adminUsers: number
  employeeUsers: number
  currentMinijobLimit: number | null
  systemStatus: string
}

interface Activity {
  id: number
  action: string
  target: string
  time: string
  type: 'user' | 'minijob' | 'system'
}

export default function AdminDashboard() {
  const router = useRouter()
  const { logout, handleSessionExpired } = useAuth()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    adminUsers: 0,
    employeeUsers: 0,
    currentMinijobLimit: null,
    systemStatus: 'online'
  })
  const [recentActivities, setRecentActivities] = useState<Activity[]>([])
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    const userString = localStorage.getItem('user')
    if (userString) {
      try {
        const user = JSON.parse(userString) as User
        setCurrentUser(user)
      } catch (error) {
        console.error('Error parsing user from localStorage:', error)
      }
    }
    loadDashboardData()
  }, [])

  const loadDashboardData = async (): Promise<void> => {
    try {
      // Load user stats
      const usersResponse = await authManager.authenticatedFetch('http://localhost:5000/api/admin/users')
      const usersData = await usersResponse.json() as UsersResponse
      
      if (usersResponse.ok && usersData.data?.users) {
        const users = usersData.data.users
        setDashboardStats(prev => ({
          ...prev,
          totalUsers: users.length,
          activeUsers: users.filter((u: User) => u.isActive).length,
          adminUsers: users.filter((u: User) => u.role === 'admin').length,
          employeeUsers: users.filter((u: User) => u.role === 'mitarbeiter').length
        }))
      }

      // Load current minijob setting
      try {
        const minijobResponse = await authManager.authenticatedFetch('http://localhost:5000/api/admin/minijob/settings/current')
        const minijobData = await minijobResponse.json() as CurrentMinijobSettingResponse
        
        if (minijobResponse.ok && minijobData.data?.setting) {
          setDashboardStats(prev => ({
            ...prev,
            currentMinijobLimit: minijobData.data.setting!.monthlyLimit
          }))
        }
      } catch (error) {
        // Minijob setting might not exist
        console.log('No current minijob setting found')
      }

      // Mock recent activities (in real app, this would come from audit logs)
      const mockActivities: Activity[] = [
        { id: 1, action: 'Benutzer erstellt', target: 'Max Mustermann', time: '2 Stunden', type: 'user' },
        { id: 2, action: 'Minijob-Limit aktualisiert', target: '600€', time: '1 Tag', type: 'minijob' },
        { id: 3, action: 'Benutzer deaktiviert', target: 'test@example.com', time: '3 Tage', type: 'user' },
        { id: 4, action: 'System-Backup erstellt', target: 'Vollständig', time: '1 Woche', type: 'system' }
      ]
      setRecentActivities(mockActivities)

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      if (errorMessage === 'SESSION_EXPIRED') {
        handleSessionExpired()
      } else {
        console.error('Fehler beim Laden der Dashboard-Daten:', error)
        setMessage('❌ Fehler beim Laden der Dashboard-Daten')
      }
    } finally {
      setLoading(false)
    }
  }

  const testProtectedRoute = async (): Promise<void> => {
    try {
      const response = await authManager.authenticatedFetch('http://localhost:5000/api/auth/profile')
      const data = await response.json()

      if (response.ok) {
        setMessage('✅ System-Test erfolgreich: API-Verbindung funktioniert einwandfrei')
      } else {
        setMessage(`❌ System-Test fehlgeschlagen: ${data.error || 'Unbekannter Fehler'}`)
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      if (errorMessage === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ System-Test fehlgeschlagen: Server nicht erreichbar')
      }
    }
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'user':
        return (
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
        )
      case 'minijob':
        return (
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </div>
        )
      case 'system':
        return (
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">Dashboard wird geladen...</p>
      </div>
    )
  }

  return (
    <div>
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Willkommen zurück, {currentUser?.name || 'Administrator'}
          </h2>
          <p className="text-gray-600">
            Hier ist eine Übersicht über Ihr System und die neuesten Aktivitäten.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Users */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <div className="text-2xl font-bold text-gray-900">{dashboardStats.totalUsers}</div>
                  <div className="text-sm text-gray-600">Gesamt Benutzer</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex text-sm text-gray-600">
                  <span className="text-green-600 font-medium">{dashboardStats.activeUsers} aktiv</span>
                  <span className="mx-2">•</span>
                  <span>{dashboardStats.totalUsers - dashboardStats.activeUsers} inaktiv</span>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Users */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <div className="text-2xl font-bold text-gray-900">{dashboardStats.adminUsers}</div>
                  <div className="text-sm text-gray-600">Administratoren</div>
                </div>
              </div>
              <div className="mt-4">
                <Link 
                  href="/admin/users"
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Verwalten →
                </Link>
              </div>
            </div>
          </div>

          {/* Employee Users */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <div className="text-2xl font-bold text-gray-900">{dashboardStats.employeeUsers}</div>
                  <div className="text-sm text-gray-600">Mitarbeiter</div>
                </div>
              </div>
              <div className="mt-4">
                <Link 
                  href="/admin/users"
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Verwalten →
                </Link>
              </div>
            </div>
          </div>

          {/* Minijob Limit */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <div className="text-2xl font-bold text-gray-900">
                    {dashboardStats.currentMinijobLimit ? formatCurrency(dashboardStats.currentMinijobLimit) : 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">Aktuelles Limit</div>
                </div>
              </div>
              <div className="mt-4">
                <Link 
                  href="/admin/minijob"
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Konfigurieren →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Action Cards & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Quick Actions */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Schnellaktionen</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Create User */}
                <Link
                  href="/admin/users"
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-semibold text-gray-900">Benutzer erstellen</h4>
                      <p className="text-sm text-gray-600">Neuen Admin oder Mitarbeiter hinzufügen</p>
                    </div>
                  </div>
                </Link>

                {/* Minijob Settings */}
                <Link
                  href="/admin/minijob"
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-semibold text-gray-900">Minijob konfigurieren</h4>
                      <p className="text-sm text-gray-600">Limits und Einstellungen verwalten</p>
                    </div>
                  </div>
                </Link>

                {/* System Test */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-semibold text-gray-900">System-Test</h4>
                      <p className="text-sm text-gray-600">API-Verbindung prüfen</p>
                    </div>
                  </div>
                  <button
                    onClick={testProtectedRoute}
                    className="w-full bg-purple-600 text-white font-medium py-2 px-4 rounded-md hover:bg-purple-700 transition-colors"
                  >
                    Test starten
                  </button>
                </div>

                {/* User Management */}
                <Link
                  href="/admin/users"
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                      <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-semibold text-gray-900">Benutzer verwalten</h4>
                      <p className="text-sm text-gray-600">Alle Benutzerkonten anzeigen und bearbeiten</p>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Letzte Aktivitäten</h3>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <div className="space-y-4">
                  {recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start space-x-3">
                      {getActivityIcon(activity.type)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {activity.action}
                        </div>
                        <div className="text-sm text-gray-600">
                          {activity.target}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          vor {activity.time}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <Link
                    href="/admin/logs"
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Alle Aktivitäten anzeigen →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">System-Status</h3>
                  <p className="text-sm text-gray-600">Alle Systeme funktionieren normal</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-900">Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Test Results */}
        {message && (
          <div className="mt-6">
            <div className={`p-4 rounded-lg border ${
              message.includes('✅')
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  {message.includes('✅') ? (
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium">{message}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  )
}