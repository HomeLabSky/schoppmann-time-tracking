'use client'

import React, { useState, useEffect, useContext, createContext, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { User, RegisterData, ApiError } from '@/types/api'
import { authApi, authenticatedFetch, setSessionExpiredHandler } from './api'

/**
 * Anmeldung im Frontend.
 *
 * Es gibt keinen Token-Speicher mehr: Die Tokens liegen in httpOnly-Cookies und sind für JavaScript unsichtbar.
 * Der angemeldete Benutzer wird nur im Arbeitsspeicher gehalten und beim Laden der Seite über /api/auth/profile
 * (bei Bedarf mit stiller Erneuerung der Sitzung) wiederhergestellt.
 */

interface AuthContextType {
  user: User | null
  /** true, solange beim Laden der Seite noch geprüft wird, ob eine Sitzung besteht */
  loading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean, message?: string, error?: string }>
  register: (data: RegisterData) => Promise<{ success: boolean, message?: string, error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  handleSessionExpired: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const homePathFor = (user: User): string => (user.role === 'admin' ? '/admin' : '/employee/dashboard')

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const handleSessionExpired = useCallback((): void => {
    setUser(null)
    router.push('/login')
  }, [router])

  // Sitzung abgelaufen (Erneuerung fehlgeschlagen) → zur Anmeldung
  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired)
    return () => setSessionExpiredHandler(null)
  }, [handleSessionExpired])

  // Beim Laden: besteht noch eine Sitzung?
  useEffect(() => {
    let active = true
    authApi.restoreSession().then((restored) => {
      if (!active) return
      setUser(restored)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean, message?: string, error?: string }> => {
    try {
      const response = await authApi.login({ email, password })
      setUser(response.data.user)
      router.push(homePathFor(response.data.user))
      return { success: true, message: response.message || 'Login erfolgreich' }
    } catch (error) {
      const apiError = error as ApiError
      return { success: false, error: apiError.error || 'Login fehlgeschlagen' }
    }
  }

  const register = async (data: RegisterData): Promise<{ success: boolean, message?: string, error?: string }> => {
    try {
      const response = await authApi.register(data)
      setUser(response.data.user)
      router.push(homePathFor(response.data.user))
      return { success: true, message: response.message || 'Registrierung erfolgreich' }
    } catch (error) {
      const apiError = error as ApiError
      return { success: false, error: apiError.details?.join(', ') || apiError.error || 'Registrierung fehlgeschlagen' }
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout() // beendet die Sitzung serverseitig und löscht die Cookies
    } catch {
      // Auch wenn der Server nicht erreichbar ist: lokal abmelden
    }
    setUser(null)
    router.push('/login')
  }

  const refreshUser = async (): Promise<void> => {
    if (!user) return
    try {
      const response = await authApi.getProfile()
      if (response.success && response.data?.user) {
        setUser(response.data.user)
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
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

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

export const authUtils = {
  getRedirectPath: (user: User): string => homePathFor(user)
}

interface UseRequireAuthOptions {
  redirectTo?: string
  requiredRole?: 'admin' | 'mitarbeiter'
}

/** Seitenschutz: leitet nicht angemeldete Benutzer zur Anmeldung, falsche Rollen zu ihrem Bereich. */
export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { redirectTo = '/login', requiredRole } = options

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push(redirectTo)
      return
    }
    if (requiredRole && user.role !== requiredRole) {
      router.push(authUtils.getRedirectPath(user))
    }
  }, [user, loading, router, redirectTo, requiredRole])

  return { user, loading }
}

/**
 * Für Seiten, die mit eigener URL abfragen: fetch mit Cookies und stiller Sitzungserneuerung.
 * Wirft Error('SESSION_EXPIRED'), wenn keine gültige Sitzung mehr besteht.
 */
export const authManager = {
  authenticatedFetch
}

export default useAuth
