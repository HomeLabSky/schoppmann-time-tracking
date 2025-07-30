// ===== src/types/api.ts - KORRIGIERTE TYPE-DEFINITIONEN =====

// Base User Interface
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

// Auth Data (was im data-Feld der Response steht)
export interface AuthData {
  accessToken: string
  refreshToken: string
  user: User
}

// Auth Response (Backend sendet standardisierte API Response)
export interface AuthResponse {
  success: boolean
  message?: string
  error?: string
  data: AuthData
  timestamp?: string
}

// ===== GENERISCHE API RESPONSE WRAPPER =====
export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  error?: string
  code?: string
  data: T
  details?: string[]
  timestamp?: string
}

// API Error Interface
export interface ApiError extends Error {
  status?: number
  error: string
  code?: string
  details?: string[]
}

// Request Configuration
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
  updatedAt?: string
  createdBy?: number
  Creator?: {
    name: string
    email: string
  }
}

export interface NewMinijobSetting {
  monthlyLimit: string | number
  description: string
  validFrom: string
  validUntil?: string | null
}

// ===== PAGINATION TYPES =====
export interface PaginationParams {
  page?: number
  limit?: number
  search?: string
  role?: string
  status?: string
}

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext?: boolean
  hasPrev?: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationInfo
}

// ===== ADMIN API RESPONSE TYPES =====

// Users Response
export interface UsersResponseData {
  users: User[]
  pagination: PaginationInfo
}

export interface UsersResponse extends ApiResponse<UsersResponseData> {}

// Single User Response
export interface UserResponseData {
  user: User
}

export interface UserResponse extends ApiResponse<UserResponseData> {}

// Minijob Settings Response
export interface MinijobSettingsResponseData {
  settings: MinijobSetting[]
  pagination: PaginationInfo
}

export interface MinijobSettingsResponse extends ApiResponse<MinijobSettingsResponseData> {}

// Single Minijob Setting Response
export interface MinijobSettingResponseData {
  setting: MinijobSetting
  autoAdjustedSettings?: Array<{
    id: number
    description: string
    oldValidUntil: string
    newValidUntil: string
    reason?: string
  }>
}

export interface MinijobSettingResponse extends ApiResponse<MinijobSettingResponseData> {}

// Current Minijob Setting Response
export interface CurrentMinijobSettingResponseData {
  setting: MinijobSetting | null
}

export interface CurrentMinijobSettingResponse extends ApiResponse<CurrentMinijobSettingResponseData> {}

// Minijob Operations Response
export interface MinijobOperationResponseData {
  adjustedCount?: number
  adjustments?: Array<{
    id: number
    description: string
    validFrom: string
    oldValidUntil: string
    newValidUntil: string
  }>
  currentSetting?: MinijobSetting
  deletedSetting?: {
    id: number
    description: string
    validFrom: string
    validUntil: string | null
  }
  adjustedSettings?: Array<{
    id: number
    description: string
    oldValidUntil: string
    newValidUntil: string
    reason: string
  }>
}

export interface MinijobOperationResponse extends ApiResponse<MinijobOperationResponseData> {}

// ===== EMPLOYEE API RESPONSE TYPES =====

// Dashboard Data
export interface EmployeeDashboardData {
  user: User
  minijobSetting: MinijobSetting | null
  settings: UserSettings
  stats: {
    currentMonth: {
      hoursWorked: number
      earnings: number
    }
  }
}

export interface EmployeeDashboardResponse extends ApiResponse<EmployeeDashboardData> {}

// User Settings Response
export interface UserSettingsResponseData {
  settings: UserSettings
}

export interface UserSettingsResponse extends ApiResponse<UserSettingsResponseData> {}

// Profile Response
export interface ProfileResponseData {
  user: User
}

export interface ProfileResponse extends ApiResponse<ProfileResponseData> {}

// ===== STATISTICS TYPES =====
export interface UserStats {
  total: number
  active: number
  inactive: number
  byRole: Array<{
    role: 'admin' | 'mitarbeiter'
    total: number
    active: number
  }>
}

export interface UserStatsResponse extends ApiResponse<UserStats> {}

export interface MinijobStats {
  overview: {
    total: number
    active: number
    inactive: number
    currentLimit: number | null
  }
  current: MinijobSetting | null
  recent: MinijobSetting[]
}

export interface MinijobStatsResponse extends ApiResponse<MinijobStats> {}

// ===== HTTP STATUS CODES =====
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

// ===== ERROR CODES =====
export enum ApiErrorCode {
  // Authentication & Authorization
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  REFRESH_TOKEN_EXPIRED = 'REFRESH_TOKEN_EXPIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // User Management
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_INACTIVE = 'USER_INACTIVE',
  EMAIL_EXISTS = 'EMAIL_EXISTS',
  INVALID_USER_ROLE = 'INVALID_USER_ROLE',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_DATE_FORMAT = 'INVALID_DATE_FORMAT',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  
  // Minijob Management
  MINIJOB_SETTING_NOT_FOUND = 'MINIJOB_SETTING_NOT_FOUND',
  OVERLAPPING_PERIODS = 'OVERLAPPING_PERIODS',
  CANNOT_DELETE_ACTIVE = 'CANNOT_DELETE_ACTIVE',
  NO_CURRENT_SETTING = 'NO_CURRENT_SETTING',
  
  // Database
  DATABASE_ERROR = 'DATABASE_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  LOGIN_RATE_LIMIT_EXCEEDED = 'LOGIN_RATE_LIMIT_EXCEEDED',
  
  // General
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

// ===== UTILITY TYPES =====
export type UserRole = 'admin' | 'mitarbeiter'

export type SortOrder = 'asc' | 'desc'

export interface SortParams {
  sortBy: string
  sortOrder: SortOrder
}

export interface FilterParams {
  search?: string
  role?: UserRole
  isActive?: boolean
  dateFrom?: string
  dateTo?: string
}

// ===== FORM TYPES =====
export interface FormErrors {
  [key: string]: string | string[]
}

export interface FormField<T = any> {
  value: T
  error?: string
  touched?: boolean
  valid?: boolean
}

export interface FormState<T = Record<string, any>> {
  values: T
  errors: FormErrors
  touched: Record<keyof T, boolean>
  isValid: boolean
  isSubmitting: boolean
}

// ===== API ENDPOINT TYPES =====
export interface ApiEndpoints {
  auth: {
    login: string
    register: string
    refresh: string
    profile: string
    logout: string
  }
  admin: {
    users: string
    minijob: string
    stats: string
  }
  employee: {
    dashboard: string
    settings: string
    profile: string
  }
}

// ===== EXPORT HELPER TYPES =====
export type ApiSuccessResponse<T = any> = ApiResponse<T> & { success: true }
export type ApiErrorResponse = ApiResponse<null> & { success: false }

// Type Guards
export const isApiSuccessResponse = <T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> => {
  return response.success === true
}

export const isApiErrorResponse = (response: ApiResponse<any>): response is ApiErrorResponse => {
  return response.success === false
}