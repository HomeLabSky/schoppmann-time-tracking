// ===== USER TYPES =====

export interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'mitarbeiter'
  isActive: boolean
  createdAt?: string
  stundenlohn?: number
  abrechnungStart?: number
  abrechnungEnde?: number
  lohnzettelEmail?: string
}

export interface NewUser {
  name: string
  email: string
  password: string
  role: 'admin' | 'mitarbeiter'
}

export interface EditUser {
  id: number
  name: string
  email: string
  password?: string
  role: 'admin' | 'mitarbeiter'
  isActive: boolean
}

export interface UserSettings {
  id: number
  stundenlohn: number
  abrechnungStart: number
  abrechnungEnde: number
  lohnzettelEmail: string
}

// ===== AUTH TYPES =====

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  name: string
  email: string
  password: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: User
}

export interface AuthResponse {
  message: string
  accessToken: string
  refreshToken: string
  user: User
}

// ===== MINIJOB TYPES =====

export interface MinijobSetting {
  id: number
  monthlyLimit: number
  description: string
  validFrom: string
  validUntil: string | null
  isActive: boolean
  createdAt: string
  Creator: {
    name: string
    email: string
  }
}

export interface NewMinijobSetting {
  monthlyLimit: string
  description: string
  validFrom: string
  validUntil?: string
}

export interface AutoAdjustedSetting {
  id: number
  description: string
  oldValidUntil: string
  newValidUntil: string
}

// ===== API RESPONSE TYPES =====

export interface ApiResponse<T = any> {
  message: string
  data?: T
  error?: string
  details?: string[]
}

export interface ApiError {
  error: string
  details?: string[]
  status?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ===== FORM TYPES =====

export interface FormError {
  field: string
  message: string
}

export interface ValidationResult {
  isValid: boolean
  errors: FormError[]
}

// ===== COMMON TYPES =====

export type UserRole = 'admin' | 'mitarbeiter'

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestConfig {
  method?: ApiMethod
  headers?: Record<string, string>
  body?: any
  requireAuth?: boolean
}