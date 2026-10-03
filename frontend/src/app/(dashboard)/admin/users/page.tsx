// frontend/src/app/(dashboard)/admin/users/page.tsx

'use client'

import { useState, useEffect } from 'react'
import { authManager, useAuth } from '@/lib/auth'
import { API_BASE_URL } from '@/lib/config'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { RefreshCw } from 'lucide-react'

// TypeScript Interfaces
interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'mitarbeiter'
  isActive: boolean
  createdAt: string
  stundenlohn?: number
  abrechnungStart?: number
  abrechnungEnde?: number
  lohnzettelEmail?: string
}

interface NewUser {
  name: string
  email: string
  password: string
  role: 'admin' | 'mitarbeiter'
}

interface EditUser {
  id: number
  name: string
  email: string
  password: string
  role: 'admin' | 'mitarbeiter'
  isActive: boolean
}

interface UserSettings {
  id: number
  stundenlohn: number
  abrechnungStart: number
  abrechnungEnde: number
  lohnzettelEmail: string
}

export default function UsersPage() {
  const { handleSessionExpired } = useAuth()

  // States
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [message, setMessage] = useState('')
  const [newUserForm, setNewUserForm] = useState<NewUser>({
    name: '',
    email: '',
    password: '',
    role: 'mitarbeiter'
  })

  // Bearbeiten-States
  const [showEditUser, setShowEditUser] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [editingUser, setEditingUser] = useState<EditUser | null>(null)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [loadingAction, setLoadingAction] = useState(false)

  useEffect(() => {
    loadAllUsers()
  }, [])

  // Alle User laden
  const loadAllUsers = async () => {
    setLoadingUsers(true)
    setMessage('')
    
    
    try {
      const response = await authManager.authenticatedFetch(`${API_BASE_URL}/api/admin/users`)
      
      console.log('📡 Response OK:', response.ok)
      
      const data = await response.json()
      
      if (response.ok) {
        setAllUsers(data.data?.users || [])
        setMessage(`✅ ${data.data?.total || 0} Benutzer geladen`)
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error: any) {
      
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage(`❌ Fehler beim Laden der Benutzer: ${error.message}`)
      }
    } finally {
      setLoadingUsers(false)
      setLoading(false)
    }
  }

  // Neuen User erstellen
  const createNewUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingAction(true)
    setMessage('')
    
    try {
      const response = await authManager.authenticatedFetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newUserForm),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setMessage(`✅ ${data.message}`)
        setNewUserForm({ name: '', email: '', password: '', role: 'mitarbeiter' })
        setShowCreateUser(false)
        loadAllUsers()
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
        setMessage('❌ Verbindungsfehler beim Erstellen des Benutzers')
      }
    } finally {
      setLoadingAction(false)
    }
  }

  const openEditUser = (user: User) => {
    setEditingUser({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      isActive: user.isActive
    })
    setShowEditUser(true)
  }

  const openUserSettings = (user: User) => {
    setUserSettings({
      id: user.id,
      stundenlohn: user.stundenlohn || 12.00,
      abrechnungStart: user.abrechnungStart || 1,
      abrechnungEnde: user.abrechnungEnde || 31,
      lohnzettelEmail: user.lohnzettelEmail || user.email
    })
    setShowUserSettings(true)
  }

  const updateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    setLoadingAction(true)
    setMessage('')

    // Bereinige die Daten - entferne leeres Passwort
    const updateData: {
      name: string
      email: string
      role: 'admin' | 'mitarbeiter'
      isActive: boolean
      password?: string
    } = {
      name: editingUser.name,
      email: editingUser.email,
      role: editingUser.role,
      isActive: editingUser.isActive
    }

    // Passwort nur hinzufügen wenn es nicht leer ist
    if (editingUser.password && editingUser.password.trim() !== '') {
      updateData.password = editingUser.password
    }

    try {
      const response = await authManager.authenticatedFetch(`${API_BASE_URL}/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData),
      })

      
      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)
        setShowEditUser(false)
        setEditingUser(null)
        loadAllUsers()
      } else {
        // Detaillierte Fehlermeldung
        if (data.details && Array.isArray(data.details)) {
          setMessage(`❌ Validierungsfehler: ${data.details.join(', ')}`)
        } else if (data.error) {
          setMessage(`❌ ${data.error}`)
        } else {
          setMessage(`❌ Unbekannter Fehler (Status: ${response.status})`)
        }
      }
    } catch (error: any) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage(`❌ Verbindungsfehler: ${error.message}`)
      }
    } finally {
      setLoadingAction(false)
    }
  }

  const updateUserSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userSettings) return

    setLoadingAction(true)
    setMessage('')

    try {
      const response = await authManager.authenticatedFetch(`${API_BASE_URL}/api/admin/users/${userSettings.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userSettings),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)
        setShowUserSettings(false)
        setUserSettings(null)
        loadAllUsers()
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error: any) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ Verbindungsfehler beim Aktualisieren der Einstellungen')
      }
    } finally {
      setLoadingAction(false)
    }
  }

  const toggleUserStatus = async (userId: number) => {
    setLoadingAction(true)
    setMessage('')

    try {
      const response = await authManager.authenticatedFetch(`${API_BASE_URL}/api/admin/users/${userId}/toggle-status`, {
        method: 'PATCH'
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`✅ ${data.message}`)
        setTimeout(() => setMessage(''), 3000)
        loadAllUsers()
      } else {
        setMessage(`❌ ${data.error}`)
      }
    } catch (error: any) {
      if (error.message === 'SESSION_EXPIRED') {
        setMessage('⏰ Sitzung abgelaufen - Sie werden ausgeloggt...')
        setTimeout(handleSessionExpired, 2000)
      } else {
        setMessage('❌ Verbindungsfehler beim Ändern des Status')
      }
    } finally {
      setLoadingAction(false)
    }
  }

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase()
  }

  const formatRate = (amount?: number) => (amount ? formatCurrency(Number(amount)) : 'Nicht gesetzt')

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">Lade Benutzer-Verwaltung...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Benutzer-Verwaltung</h2>
            <p className="text-sm text-gray-500 mt-1">
              Verwalten Sie alle Benutzer und deren Einstellungen
            </p>
          </div>
          <button
            onClick={() => setShowCreateUser(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Neuer Benutzer
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Alle Benutzer ({allUsers?.length || 0})
          </h3>
          <div className="flex space-x-2">
            <button
              onClick={loadAllUsers}
              disabled={loadingUsers}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Neu laden
            </button>
          </div>
        </div>

        {loadingUsers ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Lade Benutzer...</p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Benutzer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rolle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stundenlohn
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allUsers && allUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-100 rounded-full border-2 border-gray-200 flex items-center justify-center mr-4">
                          <span className="text-sm font-medium text-gray-600">
                            {getInitials(user.name)}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatRate(user.stundenlohn)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openEditUser(user)}
                          className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded transition-colors"
                          title="Bearbeiten"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openUserSettings(user)}
                          className="text-gray-600 hover:text-gray-900 p-1.5 hover:bg-gray-50 rounded transition-colors"
                          title="Einstellungen"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleUserStatus(user.id)}
                          className={`p-1.5 rounded transition-colors ${
                            user.isActive 
                              ? 'text-red-600 hover:text-red-900 hover:bg-red-50' 
                              : 'text-green-600 hover:text-green-900 hover:bg-green-50'
                          }`}
                          title={user.isActive ? 'Deaktivieren' : 'Aktivieren'}
                          disabled={loadingAction}
                        >
                          {user.isActive ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M6.343 6.343a9 9 0 1112.728 12.728A9 9 0 016.343 6.343z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!allUsers || allUsers.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Noch keine Benutzer vorhanden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== MODALS ===== */}

      {/* Create User Modal */}
      <Modal
        open={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        title="Neuen Benutzer erstellen"
        size="max-w-md"
        dismissible={!loadingAction}
      >
        <form onSubmit={createNewUser} className="p-6 space-y-4">
          <div>
            <label htmlFor="user-1" className="block text-sm font-medium text-gray-700 mb-2">
              Vollständiger Name
            </label>
            <input
              id="user-1"
              type="text"
              value={newUserForm.name}
              onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
              placeholder="z.B. Max Mustermann"
              required
            />
          </div>

          <div>
            <label htmlFor="user-2" className="block text-sm font-medium text-gray-700 mb-2">
              E-Mail-Adresse
            </label>
            <input
              id="user-2"
              type="email"
              value={newUserForm.email}
              onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
              placeholder="name@schoppmann.de"
              required
            />
          </div>

          <div>
            <label htmlFor="user-3" className="block text-sm font-medium text-gray-700 mb-2">
              Passwort
            </label>
            <input
              id="user-3"
              type="password"
              value={newUserForm.password}
              onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
              placeholder="Mindestens 8 Zeichen"
              required
            />
          </div>

          <div>
            <label htmlFor="user-4" className="block text-sm font-medium text-gray-700 mb-2">
              Rolle
            </label>
            <select
              id="user-4"
              value={newUserForm.role}
              onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as 'admin' | 'mitarbeiter' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            >
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loadingAction}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {loadingAction ? 'Erstelle...' : 'Benutzer erstellen'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateUser(false)}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 font-medium transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      {showEditUser && editingUser && (
        <Modal
          open
          onClose={() => setShowEditUser(false)}
          title="Benutzer bearbeiten"
          size="max-w-md"
          dismissible={!loadingAction}
        >
          <form onSubmit={updateUser} className="p-6 space-y-4">
            <div>
              <label htmlFor="user-5" className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                id="user-5"
                type="text"
                value={editingUser.name}
                onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                required
              />
            </div>

            <div>
              <label htmlFor="user-6" className="block text-sm font-medium text-gray-700 mb-2">
                E-Mail
              </label>
              <input
                id="user-6"
                type="email"
                value={editingUser.email}
                onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                required
              />
            </div>

            <div>
              <label htmlFor="user-7" className="block text-sm font-medium text-gray-700 mb-2">
                Neues Passwort (leer lassen um beizubehalten)
              </label>
              <input
                id="user-7"
                type="password"
                value={editingUser.password}
                onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
                placeholder="Leer lassen für keine Änderung"
              />
            </div>

            <div>
              <label htmlFor="user-8" className="block text-sm font-medium text-gray-700 mb-2">
                Rolle
              </label>
              <select
                id="user-8"
                value={editingUser.role}
                onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as 'admin' | 'mitarbeiter' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              >
                <option value="mitarbeiter">Mitarbeiter</option>
                <option value="admin">Administrator</option>
              </select>
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
                onClick={() => setShowEditUser(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 font-medium transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* User Settings Modal */}
      {showUserSettings && userSettings && (
        <Modal
          open
          onClose={() => setShowUserSettings(false)}
          title={`Einstellungen für ${allUsers.find(u => u.id === userSettings.id)?.name ?? ''}`}
          size="max-w-lg"
          dismissible={!loadingAction}
        >
          <form onSubmit={updateUserSettings} className="p-6 space-y-4">
            <div>
              <label htmlFor="user-9" className="block text-sm font-medium text-gray-700 mb-2">
                Stundenlohn (€)
              </label>
              <input
                id="user-9"
                type="number"
                step="0.01"
                min="0"
                max="999"
                value={userSettings.stundenlohn}
                onChange={(e) => setUserSettings({ ...userSettings, stundenlohn: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Der Betrag in Euro, den der Benutzer pro Arbeitsstunde erhält.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="user-10" className="block text-sm font-medium text-gray-700 mb-2">
                  Abrechnungszeitraum Start (Tag)
                </label>
                <input
                  id="user-10"
                  type="number"
                  min="1"
                  max="31"
                  value={userSettings.abrechnungStart}
                  onChange={(e) => setUserSettings({ ...userSettings, abrechnungStart: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  required
                />
              </div>
              <div>
                <label htmlFor="user-11" className="block text-sm font-medium text-gray-700 mb-2">
                  Abrechnungszeitraum Ende (Tag)
                </label>
                <input
                  id="user-11"
                  type="number"
                  min="1"
                  max="31"
                  value={userSettings.abrechnungEnde}
                  onChange={(e) => setUserSettings({ ...userSettings, abrechnungEnde: parseInt(e.target.value) || 31 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="user-12" className="block text-sm font-medium text-gray-700 mb-2">
                E-Mail für Lohnzettel
              </label>
              <input
                id="user-12"
                type="email"
                value={userSettings.lohnzettelEmail}
                onChange={(e) => setUserSettings({ ...userSettings, lohnzettelEmail: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
                placeholder="E-Mail für Lohnzettel-Versand"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={loadingAction}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {loadingAction ? 'Speichere...' : 'Speichern'}
              </button>
              <button
                type="button"
                onClick={() => setShowUserSettings(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 font-medium transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </Modal>
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