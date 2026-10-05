import type {
  ApiError,
  EditUser,
  LoginCredentials,
  MinijobSetting,
  NewMinijobSetting,
  NewUser,
  RegisterData,
  User,
  UserSettings,
} from '@/types/api'
import type { AuditEntry, AuditQuery, BackupStatus, Pagination, Timesheet, TimesheetOverviewRow, TimesheetPeriod } from '@/types/audit'

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
    // Notfall-Weg, falls der AuthProvider (noch) nicht eingehängt ist: harter Wechsel zur Anmeldung
    window.location.replace(new URL('/login', window.location.origin).href)
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
        headers: { 'Content-Type': 'application/json', ...CSRF_HEADER },
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

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Antwortformat des Backends: `{ success, message, data }` (Fehler: `{ success: false, error, code }`). */
export interface Envelope<T> {
  success: boolean
  message: string
  data: T
}

type Message = { success: boolean; message: string }

interface ErrorBody {
  error?: string
  details?: string[]
  fields?: Record<string, string>
  code?: string
}

const toQuery = (params: object) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

/** HTTP-Client mit Cookies, CSRF-Header, stiller Sitzungserneuerung und einheitlichen Fehlern (ApiError). */
class ApiClient {
  constructor(private readonly baseURL: string) {}

  async request<T>(
    endpoint: string,
    { method = 'GET', body, requireAuth = true }: { method?: HttpMethod; body?: unknown; requireAuth?: boolean } = {}
  ): Promise<T> {
    const send = () =>
      fetch(`${this.baseURL}${endpoint}`, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...CSRF_HEADER },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      })

    let response: Response
    try {
      response = await send()
      // Zugriffs-Token abgelaufen → still erneuern und einmal wiederholen
      if (response.status === 401 && requireAuth) {
        if (await refreshSession()) response = await send()
        if (response.status === 401) {
          handleSessionExpired()
          throw { error: 'Sitzung abgelaufen – bitte erneut anmelden', code: 'SESSION_EXPIRED', status: 401 } as ApiError
        }
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw { error: 'Verbindungsfehler – Server nicht erreichbar', status: 0 } as ApiError
      }
      throw error
    }

    const data = (await response.json().catch(() => ({}))) as T & ErrorBody
    if (!response.ok) {
      throw {
        error: data.error || `Anfrage fehlgeschlagen (${response.status})`,
        details: data.details,
        fields: data.fields,
        code: data.code,
        status: response.status,
      } as ApiError
    }
    return data
  }

  get<T>(endpoint: string, requireAuth = true) {
    return this.request<T>(endpoint, { method: 'GET', requireAuth })
  }
  post<T>(endpoint: string, body?: unknown, requireAuth = true) {
    return this.request<T>(endpoint, { method: 'POST', body, requireAuth })
  }
  put<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, { method: 'PUT', body })
  }
  patch<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, { method: 'PATCH', body })
  }
  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

export const apiClient = new ApiClient(API_BASE_URL)

// ===== Anmeldung =====

export const authApi = {
  login: (credentials: LoginCredentials) => apiClient.post<Envelope<{ user: User }>>('/api/auth/login', credentials, false),

  register: (data: RegisterData) => apiClient.post<Envelope<{ user: User }>>('/api/auth/register', data, false),

  /**
   * Stellt die Anmeldung beim Laden der Seite wieder her: Profil abrufen, bei abgelaufenem Zugriffs-Token einmal
   * still erneuern. Gibt null zurück, wenn niemand angemeldet ist (ohne Weiterleitung).
   */
  restoreSession: async (): Promise<User | null> => {
    const loadProfile = async () => (await apiClient.get<Envelope<{ user: User }>>('/api/auth/profile', false)).data.user
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

  getProfile: () => apiClient.get<Envelope<{ user: User }>>('/api/auth/profile'),

  logout: () => apiClient.post<Message>('/api/auth/logout', undefined, false),
}

// ===== Administration =====

export const adminApi = {
  getUsers: (params: { page?: number; limit?: number; search?: string; role?: string } = {}) =>
    apiClient.get<Envelope<{ users: User[]; pagination: Pagination }>>(`/api/admin/users${toQuery(params)}`),

  createUser: (data: NewUser) => apiClient.post<Envelope<{ user: User }>>('/api/admin/users', data),

  updateUser: (userId: number, data: Partial<EditUser>) =>
    apiClient.put<Envelope<{ user: User }>>(`/api/admin/users/${userId}`, data),

  updateUserSettings: (userId: number, settings: Partial<UserSettings>) =>
    apiClient.put<Envelope<{ user: User }>>(`/api/admin/users/${userId}/settings`, settings),

  toggleUserStatus: (userId: number) => apiClient.patch<Envelope<{ user: User }>>(`/api/admin/users/${userId}/toggle-status`),

  deleteUser: (userId: number) => apiClient.delete<Message>(`/api/admin/users/${userId}`),

  // Minijob-Grenzen
  getMinijobSettings: (params: { page?: number; limit?: number } = {}) =>
    apiClient.get<Envelope<{ settings: MinijobSetting[]; pagination: Pagination }>>(`/api/admin/minijob/settings${toQuery(params)}`),

  getCurrentMinijobSetting: () =>
    apiClient.get<Envelope<{ setting: MinijobSetting | null }>>('/api/admin/minijob/settings/current'),

  createMinijobSetting: (data: NewMinijobSetting) =>
    apiClient.post<Envelope<{ setting: MinijobSetting }>>('/api/admin/minijob/settings', data),

  updateMinijobSetting: (settingId: number, data: NewMinijobSetting) =>
    apiClient.put<Envelope<{ setting: MinijobSetting }>>(`/api/admin/minijob/settings/${settingId}`, data),

  deleteMinijobSetting: (settingId: number) => apiClient.delete<Message>(`/api/admin/minijob/settings/${settingId}`),

  recalculateMinijobPeriods: () =>
    apiClient.post<Envelope<{ adjustedCount: number }>>('/api/admin/minijob/settings/recalculate-periods'),

  // Zeitnachweise & Monatsabschluss
  getTimesheetOverview: (month: string) =>
    apiClient.get<Envelope<{ month: string; rows: TimesheetOverviewRow[] }>>(`/api/admin/timesheets/overview?month=${month}`),

  getTimesheetPeriods: (userId: number) =>
    apiClient.get<Envelope<{ periods: TimesheetPeriod[]; currentPeriod?: TimesheetPeriod }>>(`/api/admin/timesheets/${userId}/periods`),

  getTimesheet: (userId: number, month: string) => apiClient.get<Envelope<Timesheet>>(`/api/admin/timesheets/${userId}?month=${month}`),

  closePeriod: (userId: number, month: string) =>
    apiClient.post<Envelope<{ closure: unknown }>>(`/api/admin/timesheets/${userId}/close`, { month }),

  reopenPeriod: (userId: number, month: string, reason: string) =>
    apiClient.post<Message>(`/api/admin/timesheets/${userId}/reopen`, { month, reason }),

  // System
  getBackupStatus: () => apiClient.get<Envelope<BackupStatus>>('/api/admin/system/backup'),

  getAuditLog: (params: AuditQuery = {}) =>
    apiClient.get<Envelope<{ entries: AuditEntry[]; pagination: Pagination }>>(`/api/admin/audit${toQuery(params)}`),
}

// ===== Eigenes Konto =====

export const employeeApi = {
  changePassword: (data: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    apiClient.put<Message>('/api/employee/change-password', data),

  getSettings: () => apiClient.get<Envelope<{ settings: UserSettings }>>('/api/employee/settings'),

  /** Selbstbedienung: nur die Lohnzettel-E-Mail (Lohn/Zeitraum ändert ein Admin). */
  updateSettings: (settings: Pick<UserSettings, 'lohnzettelEmail'>) =>
    apiClient.put<Envelope<{ settings: UserSettings }>>('/api/employee/settings', settings),
}
