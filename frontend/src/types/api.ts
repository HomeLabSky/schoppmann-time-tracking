// ===== src/types/api.ts - VOLLSTÄNDIGE TYPE-DEFINITIONEN =====

// Base User Interface
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

// Auth-related Types
export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  name: string
  email: string
  password: string
  role?: 'admin' | 'mitarbeiter'
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
  message?: string
}

// ===== API RESPONSE WRAPPER =====
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  error?: string
  details?: string[]
  data: T
}

export interface ApiError extends Error {
  status?: number
  error: string
  details?: string[]
}

export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: any
  requireAuth?: boolean
}

// ===== USER MANAGEMENT TYPES =====
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
  password?: string  // Optional - nur wenn geändert
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
  monthlyLimit: string | number
  description: string
  validFrom: string
  validUntil?: string
}

// ===== ADMIN API RESPONSE TYPES =====
export interface UsersResponse {
  users: User[]
  total: number
}

export interface UserResponse {
  message: string
  user: User
}

export interface MinijobSettingsResponse {
  settings: MinijobSetting[]
  total: number
}

export interface MinijobSettingResponse {
  message: string
  setting: MinijobSetting
  autoAdjustedSettings?: Array<{
    id: number
    description: string
    oldValidUntil: string
    newValidUntil: string
  }>
}

export interface CurrentMinijobSettingResponse {
  setting: MinijobSetting
}

// ===== EMPLOYEE DASHBOARD TYPES =====
export interface EmployeeDashboardData {
  user: User
  currentMinijobLimit: number
  // Weitere Dashboard-Daten nach Bedarf
}

// ===== HTTP STATUS CODES =====
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500
}