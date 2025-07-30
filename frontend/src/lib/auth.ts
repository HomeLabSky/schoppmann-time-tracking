'use client'

import React, { useState, useEffect, useContext, createContext, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { User, LoginCredentials, RegisterData, ApiError, AuthResponse } from '@/types/api'

// ===== AUTH CONTEXT TYPES =====

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean, message?: string, error?: string }>
  register: (data: RegisterData) => Promise<{ success: boolean, message?: string, error?: string }>
  logout: () => void
  refreshUser: () => Promise<void>
  handleSessionExpired: () => void
}

// ===== CREATE CONTEXT =====

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ===== TOKEN MANAGER =====

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

// ===== API CLIENT =====

class ApiClient {
  private baseURL: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
  private refreshPromise: Promise<boolean> | null = null

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    requireAuth: boolean = true
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    }

    if (requireAuth) {
      const token = TokenManager.getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    try {
      let response = await fetch(url, {
        ...options,
        headers
      })

      // Handle token refresh on 401/403
      if ((response.status === 401 || response.status === 403) && requireAuth) {
        const refreshSuccess = await this.refreshTokens()
        
        if (refreshSuccess) {
          const newToken = TokenManager.getAccessToken()
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`
            response = await fetch(url, {
              ...options,
              headers
            })
          }
        } else {
          TokenManager.clearTokens()
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

  // Auth API Methods
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }, false)
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }, false)
  }

  async getProfile(): Promise<{ success: boolean, data: { user: User }, message?: string }> {
    return this.request('/api/auth/profile', {
      method: 'GET'
    }, true)
  }

  async refreshAuth(refreshToken: string): Promise<AuthResponse> {
    return this.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken })
    }, false)
  }
}

const apiClient = new ApiClient()

// ===== AUTH PROVIDER =====

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Initialize auth state
  useEffect(() => {
    initializeAuth()
  }, [])

  const initializeAuth = async (): Promise<void> => {
    try {
      const storedUser = TokenManager.getUser()
      const accessToken = TokenManager.getAccessToken()

      if (storedUser && accessToken) {
        try {
          const response = await apiClient.getProfile()
          
          if (response.success && response.data?.user) {
            setUser(response.data.user)
            TokenManager.setUser(response.data.user)
          } else {
            TokenManager.clearTokens()
            setUser(null)
          }
        } catch (error) {
          console.error('Token validation failed:', error)
          TokenManager.clearTokens()
          setUser(null)
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error)
      TokenManager.clearTokens()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string): Promise<{ success: boolean, message?: string, error?: string }> => {
    try {
      const credentials: LoginCredentials = { email, password }
      const response = await apiClient.login(credentials)
      
      if (response.success && response.data) {
        TokenManager.setTokens(response.data.accessToken, response.data.refreshToken)
        TokenManager.setUser(response.data.user)
        setUser(response.data.user)

        // Redirect based on role
        if (response.data.user.role === 'admin') {
          router.push('/admin')
        } else {
          router.push('/employee/dashboard')
        }

        return { 
          success: true, 
          message: response.message || 'Login erfolgreich' 
        }
      } else {
        return { 
          success: false, 
          error: response.error || 'Login fehlgeschlagen' 
        }
      }
    } catch (error) {
      const apiError = error as ApiError
      return { 
        success: false, 
        error: apiError.error || 'Login fehlgeschlagen' 
      }
    }
  }

  const register = async (data: RegisterData): Promise<{ success: boolean, message?: string, error?: string }> => {
    try {
      const response = await apiClient.register(data)
      
      if (response.success && response.data) {
        TokenManager.setTokens(response.data.accessToken, response.data.refreshToken)
        TokenManager.setUser(response.data.user)
        setUser(response.data.user)

        // Redirect based on role
        if (response.data.user.role === 'admin') {
          router.push('/admin')
        } else {
          router.push('/employee/dashboard')
        }

        return { 
          success: true,
          message: response.message || 'Registrierung erfolgreich' 
        }
      } else {
        return { 
          success: false, 
          error: response.error || 'Registrierung fehlgeschlagen' 
        }
      }
    } catch (error) {
      const apiError = error as ApiError
      return { 
        success: false, 
        error: apiError.details?.join(', ') || apiError.error || 'Registrierung fehlgeschlagen' 
      }
    }
  }

  const logout = (): void => {
    TokenManager.clearTokens()
    setUser(null)
    router.push('/login')
  }

  const handleSessionExpired = (): void => {
    console.warn('Session expired - redirecting to login')
    TokenManager.clearTokens()
    setUser(null)
    router.push('/login')
  }

  const refreshUser = async (): Promise<void> => {
    try {
      if (user) {
        const response = await apiClient.getProfile()
        
        if (response.success && response.data?.user) {
          setUser(response.data.user)
          TokenManager.setUser(response.data.user)
        }
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      handleSessionExpired()
    }
  }

  const contextValue: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    refreshUser,
    handleSessionExpired
  }

  return React.createElement(
    AuthContext.Provider,
    { value: contextValue },
    children
  )
}

// ===== USE AUTH HOOK =====

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}

// ===== AUTH UTILITIES =====

export const authUtils = {
  isAuthenticated: (): boolean => {
    return !!TokenManager.getAccessToken() && !!TokenManager.getUser()
  },

  hasRole: (role: 'admin' | 'mitarbeiter'): boolean => {
    const user = TokenManager.getUser()
    return user?.role === role
  },

  isAdmin: (): boolean => {
    return authUtils.hasRole('admin')
  },

  isEmployee: (): boolean => {
    return authUtils.hasRole('mitarbeiter')
  },

  getCurrentUser: (): User | null => {
    return TokenManager.getUser()
  },

  getRedirectPath: (user: User): string => {
    switch (user.role) {
      case 'admin':
        return '/admin'
      case 'mitarbeiter':
        return '/employee/dashboard'
      default:
        return '/login'
    }
  }
}

// ===== ROUTE PROTECTION HOOK =====

interface UseRequireAuthOptions {
  redirectTo?: string
  requiredRole?: 'admin' | 'mitarbeiter'
}

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { redirectTo = '/login', requiredRole } = options

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push(redirectTo)
        return
      }

      if (requiredRole && user.role !== requiredRole) {
        const correctPath = authUtils.getRedirectPath(user)
        router.push(correctPath)
        return
      }
    }
  }, [user, loading, router, redirectTo, requiredRole])

  return { user, loading }
}

// ===== AUTH MANAGER CLASS (für Backward Compatibility) =====

class AuthManager {
  private static instance: AuthManager
  private refreshPromise: Promise<boolean> | null = null

  private constructor() {}

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager()
    }
    return AuthManager.instance
  }

  getTokens(): { accessToken: string | null, refreshToken: string | null } {
    return {
      accessToken: TokenManager.getAccessToken(),
      refreshToken: TokenManager.getRefreshToken()
    }
  }

  getUser(): User | null {
    return TokenManager.getUser()
  }

  setTokens(tokens: { accessToken: string, refreshToken: string, user: User }): void {
    TokenManager.setTokens(tokens.accessToken, tokens.refreshToken)
    TokenManager.setUser(tokens.user)
  }

  clearAuth(): void {
    TokenManager.clearTokens()
  }

  async refreshTokens(): Promise<boolean> {
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
      console.log('❌ Kein Refresh Token vorhanden')
      return false
    }

    try {
      console.log('🔄 Erneuere Token...')
      
      const response = await apiClient.refreshAuth(refreshToken)

      if (response.success && response.data) {
        console.log('✅ Token erfolgreich erneuert')
        TokenManager.setTokens(response.data.accessToken, response.data.refreshToken)
        TokenManager.setUser(response.data.user)
        return true
      } else {
        console.log('❌ Token Refresh fehlgeschlagen:', response.error)
        TokenManager.clearTokens()
        return false
      }
    } catch (error) {
      console.error('❌ Token Refresh Error:', error)
      TokenManager.clearTokens()
      return false
    }
  }

  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = TokenManager.getAccessToken()
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.status === 401 || response.status === 403) {
      console.log('🔄 Token abgelaufen, versuche Refresh...')
      
      const refreshSuccess = await this.refreshTokens()
      
      if (refreshSuccess) {
        const newToken = TokenManager.getAccessToken()
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`,
            'Content-Type': 'application/json'
          }
        })
      } else {
        throw new Error('SESSION_EXPIRED')
      }
    }

    return response
  }
}

export const authManager = AuthManager.getInstance()

// Export Token Manager für direkte Nutzung
export { TokenManager }

export default useAuth