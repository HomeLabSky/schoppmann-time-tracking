export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Datum-Utilities Types
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export type TimeFormat = 'HH:mm' | 'HH:mm:ss';
export type DateFormat = 'DD.MM.YYYY' | 'YYYY-MM-DD';