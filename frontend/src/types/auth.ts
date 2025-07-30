export interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'mitarbeiter'
  isActive: boolean
  createdAt?: string
  updatedAt?: string
  stundenlohn?: number
  abrechnungStart?: number
  abrechnungEnde?: number
  lohnzettelEmail?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  name: string
}

export interface LoginResponse {
  success: boolean
  message?: string
  data?: {
    accessToken: string
    refreshToken: string
    user: User
  }
  error?: string
}

export interface RegisterResponse {
  success: boolean
  message?: string
  data?: {
    accessToken: string
    refreshToken: string
    user: User
  }
  error?: string
}

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
  code?: string
  timestamp?: string
}

export interface MinijobSetting {
  id: number
  monthlyLimit: number
  description: string
  validFrom: string
  validUntil: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  Creator?: {
    name: string
    email: string
  }
}

export interface NewUser {
  name: string
  email: string
  password: string
  role: 'admin' | 'mitarbeiter'
}

export interface UserSettings {
  stundenlohn: number
  abrechnungStart: number
  abrechnungEnde: number
  lohnzettelEmail: string
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export type UserRole = 'admin' | 'mitarbeiter'

export interface FormErrors {
  [key: string]: string
}