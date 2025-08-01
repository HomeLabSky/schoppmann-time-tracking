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

// API Base URL
const API_BASE_URL = 'http://localhost:5000'

// Token Management
class TokenManager {
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('accessToken')
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('refreshToken')
  }

  static setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  }

  static setUser(user: User): void {
    if (typeof window === 'undefined') return
    localStorage.setItem('user', JSON.stringify(user))
  }

  static getUser(): User | null {
    if (typeof window === 'undefined') return null
    const userData = localStorage.getItem('user')
    return userData ? JSON.parse(userData) : null
  }
}

// HTTP Client
class ApiClient {
  private baseURL: string
  private refreshPromise: Promise<boolean> | null = null

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
    
    // Prepare headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    }

    // Add auth token if required
    if (requireAuth) {
      const token = TokenManager.getAccessToken()
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`
      }
    }

    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
      ...(body && { body: JSON.stringify(body) })
    }

    try {
      let response = await fetch(url, requestOptions)

      // Handle token refresh on 401/403
      if ((response.status === 401 || response.status === 403) && requireAuth) {
        const refreshSuccess = await this.refreshTokens()
        
        if (refreshSuccess) {
          // Retry with new token
          const newToken = TokenManager.getAccessToken()
          if (newToken) {
            requestHeaders['Authorization'] = `Bearer ${newToken}`
            response = await fetch(url, {
              ...requestOptions,
              headers: requestHeaders
            })
          }
        } else {
          // Refresh failed - redirect to login
          TokenManager.clearTokens()
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
          throw new Error('SESSION_EXPIRED')
        }
      }

      const data = await response.json()

      if (!response.ok) {
        throw {
          error: data.error || 'Request failed',
          details: data.details,
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

  // Token refresh logic
  private async refreshTokens(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = this.performRefresh()
    const result = await this.refreshPromise
    this.refreshPromise = null
    return result
  }

  private async performRefresh(): Promise<boolean> {
    const refreshToken = TokenManager.getRefreshToken()
    
    if (!refreshToken) {
      return false
    }

    try {
      const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        TokenManager.setTokens(data.data.accessToken, data.data.refreshToken)
        TokenManager.setUser(data.data.user)
        return true
      } else {
        TokenManager.clearTokens()
        return false
      }
    } catch (error) {
      TokenManager.clearTokens()
      return false
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

  refresh: (refreshToken: string): Promise<AuthResponse> =>
    apiClient.post('/api/auth/refresh', { refreshToken }, false),

  getProfile: (): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.get('/api/auth/profile'),

  changePassword: (data: { currentPassword: string, newPassword: string }): Promise<{ success: boolean, message: string }> =>
    apiClient.put('/api/auth/change-password', data),

  updateProfile: (data: { name?: string, email?: string }): Promise<{ success: boolean, data: { user: User }, message: string }> =>
    apiClient.put('/api/auth/profile', data),

  logout: (): Promise<{ success: boolean, message: string }> =>
    apiClient.post('/api/auth/logout'),
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

  // System
  createFirstAdmin: (): Promise<{ success: boolean, data: any, message: string }> =>
    apiClient.get('/api/admin/create-first-admin'),

  resetDatabase: (): Promise<{ success: boolean, data: any, message: string }> =>
    apiClient.post('/api/admin/reset-database'),

  resetDatabaseConfirm: (confirmation: string): Promise<{ success: boolean, data: any, message: string }> =>
    apiClient.post('/api/admin/reset-database-confirm', { confirmation }),
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
export { apiClient, TokenManager }
export default apiClient