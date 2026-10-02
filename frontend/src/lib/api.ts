// frontend/src/lib/api.ts - KORRIGIERTE VERSION

import type { 
  ApiResponse, 
  ApiError, 
  RequestConfig,
  LoginCredentials,
  RegisterData,
  AuthResponse,
  User,
  NewUser,
  EditUser,
  UserSettings,
  MinijobSetting,
  NewMinijobSetting
} from '@/types/api'
import type { AuditEntry, AuditQuery, BackupStatus, Pagination, Timesheet, TimesheetPeriod } from '@/types/audit'

import { API_BASE_URL } from './config'

/**
 * Anmeldung über httpOnly-Cookies: Der Browser schickt die Cookies automatisch mit (`credentials: 'include'`),
 * JavaScript sieht die Tokens nie. Ändernde Anfragen tragen den Header X-CSRF-Protection (Pflicht im Backend).
 *
 * Läuft das kurze Zugriffs-Token ab (401), wird still über das Erneuerungs-Cookie eine neue Sitzung geholt
 * und die Anfrage einmal wiederholt. Gelingt das nicht, gilt die Sitzung als abgelaufen.
 */
const CSRF_HEADER = { 'X-CSRF-Protection': '1' }

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Wird vom AuthProvider gesetzt: räumt den Zustand auf und leitet zur Anmeldung weiter
let sessionExpiredHandler: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

function handleSessionExpired(): void {
  if (sessionExpiredHandler) {
    sessionExpiredHandler()
    return
  }
  if (typeof window !== 'undefined' && !/^\/(login|register)/.test(window.location.pathname)) {
    window.location.href = '/login'
  }
}

// Mehrere gleichzeitige 401-Antworten teilen sich eine einzige Erneuerung
let refreshPromise: Promise<boolean> | null = null

async function performRefresh(): Promise<boolean> {
  // Bis zu 4 Versuche: erneuert ein zweiter Tab gerade parallel (409), liegt danach das neue Cookie vor
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...CSRF_HEADER }
      })
      if (response.ok) return true
      const data = await response.json().catch(() => null)
      if (response.status === 409 && data?.code === 'REFRESH_IN_PROGRESS') {
        await delay(300)
        continue
      }
      return false
    } catch {
      return false
    }
  }
  return false
}

export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/**
 * fetch mit Cookies, Sicherheits-Header und stiller Sitzungserneuerung (für Seiten mit eigener URL).
 * Wirft Error('SESSION_EXPIRED'), wenn keine gültige Sitzung mehr besteht.
 */
export async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...CSRF_HEADER,
        ...(init.headers as Record<string, string> | undefined)
      }
    })

  let response = await send()
  if (response.status === 401) {
    if (await refreshSession()) {
      response = await send()
      if (response.status !== 401) return response
    }
    handleSessionExpired()
    throw new Error('SESSION_EXPIRED')
  }
  return response
}

// HTTP Client
class ApiClient {
  private baseURL: string

  constructor(baseURL: string) {
    this.baseURL = baseURL
  }

  // Generic request method
  async request<T = any>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      requireAuth = true
    } = config

    const url = `${this.baseURL}${endpoint}`
    const send = () =>
      fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...headers },
        ...(body !== undefined && { body: JSON.stringify(body) })
      })

    try {
      let response = await send()

      // Zugriffs-Token abgelaufen → still erneuern und einmal wiederholen
      if (response.status === 401 && requireAuth) {
        if (await refreshSession()) {
          response = await send()
        }
        if (response.status === 401) {
          handleSessionExpired()
          throw new Error('SESSION_EXPIRED')
        }
      }

      const data = await response.json()

      if (!response.ok) {
        throw {
          error: data.error || 'Request failed',
          details: data.details,
          code: data.code,
          status: response.status
        } as ApiError
      }

      return data
    } catch (error) {
      if (error instanceof TypeError) {
        throw {
          error: 'Verbindungsfehler - Server nicht erreichbar',
          status: 0
        } as ApiError
      }
      throw error
    }
  }

  // Convenience methods
  async get<T = any>(endpoint: string, requireAuth = true): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', requireAuth })
  }

  async post<T = any>(endpoint: string, body?: any, requireAuth = true): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body, requireAuth })
  }

  async put<T = any>(endpoint: string, body?: any, requireAuth = true): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body, requireAuth })
  }

  async patch<T = any>(endpoint: string, body?: any, requireAuth = true): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body, requireAuth })
  }

  async delete<T = any>(endpoint: string, requireAuth = true): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', requireAuth })
  }
}

// Create API client instance
const apiClient = new ApiClient(API_BASE_URL)

// ===== AUTH API - KORRIGIERTE ENDPUNKTE =====

export const authApi = {
  login: (credentials: LoginCredentials): Promise<AuthResponse> =>
    apiClient.post('/api/auth/login', credentials, false),

  register: (data: RegisterData): Promise<AuthResponse> =>
    apiClient.post('/api/auth/register', data, false),

  /**
   * Stellt die Anmeldung beim Laden der Seite wieder her: Profil abrufen, bei abgelaufenem Zugriffs-Token einmal
   * still erneuern. Gibt null zurück, wenn niemand angemeldet ist (ohne Weiterleitung).
   */
  restoreSession: async (): Promise<User | null> => {
    const loadProfile = async (): Promise<User> => {
      const res = await apiClient.request<{ data: { user: User } }>('/api/auth/profile', { requireAuth: false })
      return res.data.user
    }
    try {
      return await loadProfile()
    } catch (error) {
      if ((error as ApiError)?.status === 401 && (await refreshSession())) {
        try {
          return await loadProfile()
        } catch {
          return null
        }
      }
      return null
    }
  },

  getProfile: (): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.get('/api/auth/profile'),

  changePassword: (data: { currentPassword: string, newPassword: string }): Promise<{ success: boolean, message: string }> =>
    apiClient.put('/api/auth/change-password', data),

  updateProfile: (data: { name?: string, email?: string }): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.put('/api/auth/profile', data),

  logout: (): Promise<{ success: boolean, message: string }> =>
    apiClient.post('/api/auth/logout', undefined, false),
}

// ===== ADMIN API - KORRIGIERTE ENDPUNKTE =====

export const adminApi = {
  // User Management
  getUsers: (params?: { page?: number, limit?: number, search?: string, role?: string }): Promise<{ success: boolean, data: { users: User[], pagination: any }, message: string }> =>
    apiClient.get(`/api/admin/users${params ? '?' + new URLSearchParams(params as any).toString() : ''}`),

  getUser: (userId: number): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.get(`/api/admin/users/${userId}`),

  createUser: (userData: NewUser): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.post('/api/admin/users', userData),

  updateUser: (userId: number, userData: Partial<EditUser>): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.put(`/api/admin/users/${userId}`, userData),

  updateUserSettings: (userId: number, settings: Partial<UserSettings>): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.put(`/api/admin/users/${userId}/settings`, settings),

  toggleUserStatus: (userId: number): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.patch(`/api/admin/users/${userId}/toggle-status`),

  deleteUser: (userId: number): Promise<{ success: boolean, message: string }> =>
    apiClient.delete(`/api/admin/users/${userId}`),

  getUserStats: (): Promise<{ success: boolean, data: any, message: string }> =>
    apiClient.get('/api/admin/stats/users'),

  // Minijob Settings
  getMinijobSettings: (params?: { page?: number, limit?: number, status?: string }): Promise<{ success: boolean, data: { settings: MinijobSetting[], pagination: any }, message: string }> =>
    apiClient.get(`/api/admin/minijob/settings${params ? '?' + new URLSearchParams(params as any).toString() : ''}`),

  getCurrentMinijobSetting: (): Promise<{ success: boolean, data: { setting: MinijobSetting }, message: string }> =>
    apiClient.get('/api/admin/minijob/settings/current'),

  createMinijobSetting: (data: NewMinijobSetting): Promise<{ success: boolean, data: { setting: MinijobSetting, autoAdjustedSettings?: any[] }, message: string }> =>
    apiClient.post('/api/admin/minijob/settings', data),

  updateMinijobSetting: (settingId: number, data: NewMinijobSetting): Promise<{ success: boolean, data: { setting: MinijobSetting }, message: string }> =>
    apiClient.put(`/api/admin/minijob/settings/${settingId}`, data),

  deleteMinijobSetting: (settingId: number): Promise<{ success: boolean, data: { adjustedSettings?: any[] }, message: string }> =>
    apiClient.delete(`/api/admin/minijob/settings/${settingId}`),

  recalculateMinijobPeriods: (): Promise<{ success: boolean, data: { adjustedCount: number, adjustments?: any[] }, message: string }> =>
    apiClient.post('/api/admin/minijob/settings/recalculate-periods'),

  refreshMinijobStatus: (): Promise<{ success: boolean, data: { currentSetting?: MinijobSetting }, message: string }> =>
    apiClient.post('/api/admin/minijob/settings/refresh-status'),

  getMinijobStats: (): Promise<{ success: boolean, data: any, message: string }> =>
    apiClient.get('/api/admin/minijob/stats'),

  // Zeitnachweise & Monatsabschluss
  getTimesheetPeriods: (userId: number): Promise<{ success: boolean, data: { periods: TimesheetPeriod[], currentPeriod?: TimesheetPeriod }, message: string }> =>
    apiClient.get(`/api/admin/timesheets/${userId}/periods`),

  getTimesheet: (userId: number, month: string): Promise<{ success: boolean, data: Timesheet, message: string }> =>
    apiClient.get(`/api/admin/timesheets/${userId}?month=${month}`),

  closePeriod: (userId: number, month: string): Promise<{ success: boolean, data: { closure: unknown }, message: string }> =>
    apiClient.post(`/api/admin/timesheets/${userId}/close`, { month }),

  reopenPeriod: (userId: number, month: string, reason: string): Promise<{ success: boolean, message: string }> =>
    apiClient.post(`/api/admin/timesheets/${userId}/reopen`, { month, reason }),

  // Systemstatus: Datensicherung
  getBackupStatus: (): Promise<{ success: boolean, data: BackupStatus, message: string }> =>
    apiClient.get('/api/admin/system/backup'),

  // Änderungsprotokoll (nur lesend)
  getAuditLog: (params: AuditQuery = {}): Promise<{ success: boolean, data: { entries: AuditEntry[], pagination: Pagination }, message: string }> => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== null) query.set(key, String(value))
    })
    const qs = query.toString()
    return apiClient.get(`/api/admin/audit${qs ? '?' + qs : ''}`)
  },
}

// ===== EMPLOYEE API - KORRIGIERTE ENDPUNKTE =====

export const employeeApi = {
  getProfile: (): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.get('/api/employee/profile'),

  updateProfile: (data: { name?: string, email?: string }): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.put('/api/employee/profile', data),

  changePassword: (data: { currentPassword: string, newPassword: string, confirmPassword: string }): Promise<{ success: boolean, message: string }> =>
    apiClient.put('/api/employee/change-password', data),

  getSettings: (): Promise<{ success: boolean, data: { settings: UserSettings, userInfo: any }, message: string }> =>
    apiClient.get('/api/employee/settings'),

  updateSettings: (settings: Partial<UserSettings>): Promise<{ success: boolean, data: { settings: UserSettings }, message: string }> =>
    apiClient.put('/api/employee/settings', settings),

  getCurrentMinijobSetting: (): Promise<{ success: boolean, data: { setting: MinijobSetting }, message: string }> =>
    apiClient.get('/api/employee/minijob/current'),

  getDashboard: (): Promise<{ success: boolean, data: any, message: string }> =>
    apiClient.get('/api/employee/dashboard'),

  getAccountStatus: (): Promise<{ success: boolean, data: any, message: string }> =>
    apiClient.get('/api/employee/account-status'),

  logout: (): Promise<{ success: boolean, message: string }> =>
    apiClient.post('/api/employee/logout'),
}

// Export the main client and token manager
export { apiClient }
export default apiClient