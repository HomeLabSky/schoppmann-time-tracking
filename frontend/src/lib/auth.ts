'use client'

import { useState, useEffect, useContext, createContext, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, TokenManager } from './api'
import type { User, LoginCredentials, RegisterData, ApiError } from '@/types/api'

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

// ===== AUTH PROVIDER =====

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // Initialize auth state
  useEffect(() => {
    initializeAuth()
  }, [])

  const initializeAuth = async () => {
    try {
      const storedUser = TokenManager.getUser()
      const accessToken = TokenManager.getAccessToken()

      if (storedUser && accessToken) {
        // Verify token is still valid by getting profile
        try {
          const response = await authApi.getProfile()
          
          // FIX: Prüfe ob response die erwartete Struktur hat
          if (response && typeof response === 'object' && 'success' in response) {
            // API Response Format: { success: boolean, data: { user: User }, message?: string }
            if (response.success && response.data?.user) {
              setUser(response.data.user)
            } else {
              // Token invalid oder API-Fehler
              TokenManager.clearTokens()
              setUser(null)
            }
          } else {
            // Fallback: Direkter User-Response (alte API-Version)
            if (response && 'id' in response && 'email' in response) {
              setUser(response as User)
            } else {
              TokenManager.clearTokens()
              setUser(null)
            }
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
      const response = await authApi.login(credentials)
      
      if (response.success) {
        // Store tokens and user
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
      const response = await authApi.register(data)
      
      if (response.success) {
        // Store tokens and user
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

  const logout = () => {
    TokenManager.clearTokens()
    setUser(null)
    router.push('/login')
  }

  const handleSessionExpired = () => {
    console.warn('Session expired - redirecting to login')
    TokenManager.clearTokens()
    setUser(null)
    router.push('/login')
  }

  const refreshUser = async () => {
    try {
      if (user) {
        const response = await authApi.getProfile()
        
        // FIX: Gleiche Prüfung wie in initializeAuth
        if (response && typeof response === 'object' && 'success' in response) {
          if (response.success && response.data?.user) {
            setUser(response.data.user)
            TokenManager.setUser(response.data.user)
          }
        } else if (response && 'id' in response && 'email' in response) {
          // Fallback für direkten User-Response
          const userResponse = response as User
          setUser(userResponse)
          TokenManager.setUser(userResponse)
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

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
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
  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    return !!TokenManager.getAccessToken() && !!TokenManager.getUser()
  },

  // Check if user has specific role
  hasRole: (role: 'admin' | 'mitarbeiter'): boolean => {
    const user = TokenManager.getUser()
    return user?.role === role
  },

  // Check if user is admin
  isAdmin: (): boolean => {
    return authUtils.hasRole('admin')
  },

  // Check if user is employee
  isEmployee: (): boolean => {
    return authUtils.hasRole('mitarbeiter')
  },

  // Get current user
  getCurrentUser: (): User | null => {
    return TokenManager.getUser()
  },

  // Get redirect path based on user role
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
      // Not authenticated
      if (!user) {
        router.push(redirectTo)
        return
      }

      // Role check
      if (requiredRole && user.role !== requiredRole) {
        const correctPath = authUtils.getRedirectPath(user)
        router.push(correctPath)
        return
      }
    }
  }, [user, loading, router, redirectTo, requiredRole])

  return { user, loading }
}

// ===== SESSION MANAGEMENT =====

export const sessionManager = {
  // Clear session and redirect to login
  clearSession: () => {
    TokenManager.clearTokens()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  },

  // Handle session expired
  handleSessionExpired: () => {
    console.warn('Session expired - redirecting to login')
    sessionManager.clearSession()
  },

  // Check if session is valid
  isSessionValid: (): boolean => {
    const token = TokenManager.getAccessToken()
    const user = TokenManager.getUser()
    
    if (!token || !user) {
      return false
    }

    // You could add token expiry check here
    return true
  }
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

  // Token aus localStorage laden
  getTokens(): { accessToken: string | null, refreshToken: string | null } {
    return {
      accessToken: TokenManager.getAccessToken(),
      refreshToken: TokenManager.getRefreshToken()
    }
  }

  // User aus localStorage laden
  getUser(): User | null {
    return TokenManager.getUser()
  }

  // Tokens speichern
  setTokens(tokens: { accessToken: string, refreshToken: string, user: User }): void {
    TokenManager.setTokens(tokens.accessToken, tokens.refreshToken)
    TokenManager.setUser(tokens.user)
  }

  // Alle Auth-Daten löschen
  clearAuth(): void {
    TokenManager.clearTokens()
  }

  // Token automatisch erneuern
  async refreshTokens(): Promise<boolean> {
    // Wenn bereits ein Refresh läuft, warten
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
      
      const response = await authApi.refresh(refreshToken)

      if (response.success) {
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

  // API-Call mit automatischem Token Refresh
  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = TokenManager.getAccessToken()
    
    // Ersten Versuch mit aktuellem Token
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`
      }
    })

    // Wenn 401/403, versuche Token zu erneuern
    if (response.status === 401 || response.status === 403) {
      console.log('🔄 Token abgelaufen, versuche Refresh...')
      
      const refreshSuccess = await this.refreshTokens()
      
      if (refreshSuccess) {
        // Retry mit neuem Token
        const newToken = TokenManager.getAccessToken()
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`
          }
        })
      } else {
        // Refresh fehlgeschlagen - User muss sich neu einloggen
        throw new Error('SESSION_EXPIRED')
      }
    }

    return response
  }
}

export const authManager = AuthManager.getInstance()

export default useAuth