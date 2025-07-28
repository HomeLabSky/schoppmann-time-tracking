export interface MinijobSetting {
  id: number;
  userId: number;
  maxMonthlyHours: number; // Standard: 70h für 520€
  maxMonthlyEarnings: number; // Standard: 520€
  hourlyRate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMinijobSettingRequest {
  maxMonthlyHours: number;
  maxMonthlyEarnings: number;
  hourlyRate: number;
}

export interface MinijobStatus {
  currentMonthHours: number;
  currentMonthEarnings: number;
  remainingHours: number;
  remainingEarnings: number;
  warningLevel: 'safe' | 'warning' | 'critical';
}