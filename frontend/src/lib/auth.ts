'use client'

import { useState, useEffect, useContext, createContext } from 'react'
import { useRouter } from 'next/navigation'
import { authApi, TokenManager } from './api'
import type { User, LoginCredentials, RegisterData, ApiError } from '@/types/api'

// ===== AUTH CONTEXT =====

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (credentials: LoginCredentials) => Promise<{ success: boolean, error?: string }>
  register: (data: RegisterData) => Promise<{ success: boolean, error?: string }>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// ===== AUTH PROVIDER =====

interface AuthProviderProps {
  children: React.ReactNode
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
          const currentUser = await authApi.getProfile()
          setUser(currentUser)
        } catch (error) {
          // Token invalid, clear storage
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

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean, error?: string }> => {
    try {
      const response = await authApi.login(credentials)
      
      // Store tokens and user
      TokenManager.setTokens(response.accessToken, response.refreshToken)
      TokenManager.setUser(response.user)
      setUser(response.user)

      return { success: true }
    } catch (error) {
      const apiError = error as ApiError
      return { 
        success: false, 
        error: apiError.error || 'Login fehlgeschlagen' 
      }
    }
  }

  const register = async (data: RegisterData): Promise<{ success: boolean, error?: string }> => {
    try {
      const response = await authApi.register(data)
      
      // Store tokens and user
      TokenManager.setTokens(response.accessToken, response.refreshToken)
      TokenManager.setUser(response.user)
      setUser(response.user)

      return { success: true }
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

  const refreshUser = async () => {
    try {
      if (user) {
        const currentUser = await authApi.getProfile()
        setUser(currentUser)
        TokenManager.setUser(currentUser)
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      logout()
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    refreshUser
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ===== USE AUTH HOOK =====

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  
  if (!context) {
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

export default useAuth