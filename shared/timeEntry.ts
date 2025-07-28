export interface TimeEntry {
  id: number;
  userId: number;
  startTime: Date;
  endTime?: Date;
  breakDuration?: number; // in Minuten
  description?: string;
  isActive: boolean; // läuft die Zeiterfassung noch?
  totalMinutes?: number; // berechnet: endTime - startTime - breakDuration
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTimeEntryRequest {
  description?: string;
}

export interface UpdateTimeEntryRequest {
  endTime?: Date;
  breakDuration?: number;
  description?: string;
}

export interface TimeEntryStats {
  totalHoursToday: number;
  totalHoursWeek: number;
  totalHoursMonth: number;
  currentEntry?: TimeEntry;
}