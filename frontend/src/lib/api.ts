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
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

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
      const response = await fetch(`${this.baseURL}/api/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })

      const data = await response.json()

      if (response.ok) {
        TokenManager.setTokens(data.accessToken, data.refreshToken)
        TokenManager.setUser(data.user)
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

// ===== AUTH API =====

export const authApi = {
  login: (credentials: LoginCredentials): Promise<AuthResponse> =>
    apiClient.post('/api/login', credentials, false),

  register: (data: RegisterData): Promise<AuthResponse> =>
    apiClient.post('/api/register', data, false),

  refresh: (refreshToken: string): Promise<AuthResponse> =>
    apiClient.post('/api/refresh', { refreshToken }, false),

  getProfile: (): Promise<User> =>
    apiClient.get('/api/profile'),
}

// ===== ADMIN API =====

export const adminApi = {
  // User Management
  getUsers: (): Promise<{ users: User[], total: number }> =>
    apiClient.get('/api/admin/users'),

  createUser: (userData: NewUser): Promise<{ message: string, user: User }> =>
    apiClient.post('/api/admin/users', userData),

  updateUser: (userId: number, userData: Partial<EditUser>): Promise<{ message: string, user: User }> =>
    apiClient.put(`/api/admin/users/${userId}`, userData),

  updateUserSettings: (userId: number, settings: Partial<UserSettings>): Promise<{ message: string, user: User }> =>
    apiClient.put(`/api/admin/users/${userId}/settings`, settings),

  toggleUserStatus: (userId: number): Promise<{ message: string, user: User }> =>
    apiClient.patch(`/api/admin/users/${userId}/toggle-status`),

  // Minijob Settings
  getMinijobSettings: (): Promise<{ settings: MinijobSetting[], total: number }> =>
    apiClient.get('/api/admin/minijob-settings'),

  getCurrentMinijobSetting: (): Promise<{ setting: MinijobSetting }> =>
    apiClient.get('/api/admin/minijob-settings/current'),

  createMinijobSetting: (data: NewMinijobSetting): Promise<{ message: string, setting: MinijobSetting, autoAdjustedSettings?: any[] }> =>
    apiClient.post('/api/admin/minijob-settings', data),

  updateMinijobSetting: (settingId: number, data: NewMinijobSetting): Promise<{ message: string, setting: MinijobSetting }> =>
    apiClient.put(`/api/admin/minijob-settings/${settingId}`, data),

  deleteMinijobSetting: (settingId: number): Promise<{ message: string, adjustedSettings?: any[] }> =>
    apiClient.delete(`/api/admin/minijob-settings/${settingId}`),

  recalculateMinijobPeriods: (): Promise<{ message: string, adjustments?: any[] }> =>
    apiClient.post('/api/admin/minijob-settings/recalculate-periods'),

  refreshMinijobStatus: (): Promise<{ message: string, currentSetting?: MinijobSetting }> =>
    apiClient.post('/api/admin/minijob-settings/refresh-status'),
}

// ===== EMPLOYEE API =====

export const employeeApi = {
  getDashboard: (): Promise<any> =>
    apiClient.get('/api/employee/dashboard'),

  updateSettings: (settings: Partial<UserSettings>): Promise<{ message: string }> =>
    apiClient.put('/api/employee/settings', settings),
}

// Export the main client and token manager
export { apiClient, TokenManager }
export default apiClient