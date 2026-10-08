'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adminApi, employeeApi, authApi } from './api'
import { periodContaining, timeApi, type BillingPeriod, type TimeEntryPayload } from './timetracking'
import { formatDate, getErrorMessage } from './utils'
import type { AuditQuery } from '@/types/audit'
import type { NewMinijobSetting, NewUser, EditUser, SpecialItemPayload, UserSettings } from '@/types/api'

/**
 * Server-Zustand an einer Stelle: Abfragen mit Cache, Ladezustand und automatischem Neuladen.
 * Nach Änderungen werden die betroffenen Schlüssel invalidiert – kein manuelles Nachladen in den Seiten.
 */
export const queryKeys = {
  users: ['users'] as const,
  minijobSettings: ['minijob', 'settings'] as const,
  minijobCurrent: ['minijob', 'current'] as const,
  timesheetPeriods: (userId: number) => ['timesheets', userId, 'periods'] as const,
  timesheet: (userId: number, month: string) => ['timesheets', userId, month] as const,
  timesheetsAll: ['timesheets'] as const,
  timesheetOverview: (month: string) => ['timesheets', 'overview', month] as const,
  audit: (params: AuditQuery) => ['audit', params] as const,
  backup: ['system', 'backup'] as const,
  myPeriods: ['me', 'periods'] as const,
  myMonth: (month: string) => ['me', 'month', month] as const,
  myMonthAll: ['me', 'month'] as const,
  mySettings: ['me', 'settings'] as const,
  mySessions: ['me', 'sessions'] as const,
  myPayslips: ['me', 'payslips'] as const,
}

const notifyError = (fallback: string) => (error: unknown) => toast.error(getErrorMessage(error, fallback))

/** Höchstwert für `limit` bei Listen-Endpunkten (API-Vertrag) */
const MAX_PAGE_SIZE = 200

/** Alle Seiten eines Listen-Endpunkts nacheinander laden (die API liefert höchstens MAX_PAGE_SIZE je Seite). */
async function fetchAllPages<T>(load: (page: number) => Promise<{ items: T[]; totalPages: number }>): Promise<T[]> {
  const first = await load(1)
  const items = [...first.items]
  for (let page = 2; page <= first.totalPages; page++) items.push(...(await load(page)).items)
  return items
}

// ---------- Benutzer ----------

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () =>
      fetchAllPages((page) =>
        adminApi
          .getUsers({ page, limit: MAX_PAGE_SIZE })
          .then((r) => ({ items: r.data.users, totalPages: r.data.pagination.totalPages })),
      ),
  })
}

function useInvalidateUsers() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.users })
    qc.invalidateQueries({ queryKey: ['audit'] })
  }
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (data: NewUser) => adminApi.createUser(data),
    onSuccess: (_r, data) => {
      invalidate()
      toast.success(`${data.name} wurde angelegt.`)
    },
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EditUser> }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      invalidate()
      toast.success('Benutzer gespeichert.')
    },
  })
}

export function useUpdateUserSettings() {
  const qc = useQueryClient()
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<UserSettings> }) => adminApi.updateUserSettings(id, data),
    onSuccess: () => {
      invalidate()
      // Abrechnungszeitraum/Stundenlohn beeinflussen Perioden und Zeitnachweise
      qc.invalidateQueries({ queryKey: queryKeys.timesheetsAll })
      toast.success('Abrechnungsdaten gespeichert.')
    },
  })
}

export function useToggleUserStatus() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (id: number) => adminApi.toggleUserStatus(id),
    onSuccess: (r) => {
      invalidate()
      toast.success(r.message || 'Status geändert.')
    },
    onError: notifyError('Status konnte nicht geändert werden'),
  })
}

export function useRevokeUserSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminApi.revokeUserSessions(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['audit'] })
      const n = r.data.revokedCount
      toast.success(n === 0 ? 'Der Benutzer war nirgends angemeldet.' : `${n} ${n === 1 ? 'Sitzung' : 'Sitzungen'} beendet.`)
    },
    onError: notifyError('Sitzungen konnten nicht beendet werden'),
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => {
      invalidate()
      toast.success('Benutzer gelöscht.')
    },
    onError: notifyError('Benutzer konnte nicht gelöscht werden'),
  })
}

// ---------- Minijob-Grenzen ----------

export function useMinijobSettings() {
  return useQuery({
    queryKey: queryKeys.minijobSettings,
    queryFn: () =>
      fetchAllPages((page) =>
        adminApi
          .getMinijobSettings({ page, limit: MAX_PAGE_SIZE })
          .then((r) => ({ items: r.data.settings, totalPages: r.data.pagination.totalPages })),
      ),
  })
}

export function useCurrentMinijobSetting() {
  return useQuery({
    queryKey: queryKeys.minijobCurrent,
    // 404 = keine aktuelle Grenze → null statt Fehler
    queryFn: () =>
      adminApi
        .getCurrentMinijobSetting()
        .then((r) => r.data.setting ?? null)
        .catch((error) => {
          if ((error as { status?: number })?.status === 404) return null
          throw error
        }),
  })
}

function useInvalidateMinijob() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['minijob'] })
    // Grenzen beeinflussen Auszahlung/Übertrag offener Perioden
    qc.invalidateQueries({ queryKey: queryKeys.timesheetsAll })
    qc.invalidateQueries({ queryKey: ['audit'] })
  }
}

export function useSaveMinijobSetting() {
  const invalidate = useInvalidateMinijob()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: NewMinijobSetting }) =>
      id ? adminApi.updateMinijobSetting(id, data) : adminApi.createMinijobSetting(data),
    onSuccess: (r, vars) => {
      invalidate()
      toast.success(vars.id ? 'Grenze gespeichert.' : r.message || 'Grenze angelegt.')
    },
  })
}

export function useDeleteMinijobSetting() {
  const invalidate = useInvalidateMinijob()
  return useMutation({
    mutationFn: (id: number) => adminApi.deleteMinijobSetting(id),
    onSuccess: (r) => {
      invalidate()
      toast.success(r.message || 'Grenze gelöscht.')
    },
    onError: notifyError('Grenze konnte nicht gelöscht werden'),
  })
}

export function useRecalculateMinijob() {
  const invalidate = useInvalidateMinijob()
  return useMutation({
    mutationFn: () => adminApi.recalculateMinijobPeriods(),
    onSuccess: (r) => {
      invalidate()
      toast.success(r.message || 'Zeiträume neu berechnet.')
    },
    onError: notifyError('Neuberechnung fehlgeschlagen'),
  })
}

// ---------- Zeitnachweise & Monatsabschluss ----------

export function useTimesheetOverview(month: string) {
  return useQuery({
    queryKey: queryKeys.timesheetOverview(month),
    queryFn: () => adminApi.getTimesheetOverview(month).then((r) => r.data.rows),
    enabled: !!month,
    placeholderData: keepPreviousData,
  })
}

export function useTimesheetPeriods(userId: number | null) {
  return useQuery({
    queryKey: queryKeys.timesheetPeriods(userId ?? 0),
    queryFn: () => adminApi.getTimesheetPeriods(userId!).then((r) => r.data),
    enabled: !!userId,
  })
}

export function useTimesheet(userId: number | null, month: string) {
  return useQuery({
    queryKey: queryKeys.timesheet(userId ?? 0, month),
    queryFn: () => adminApi.getTimesheet(userId!, month).then((r) => r.data),
    enabled: !!userId && !!month,
    placeholderData: keepPreviousData,
  })
}

function useInvalidateTimesheets() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.timesheetsAll })
    qc.invalidateQueries({ queryKey: ['audit'] })
  }
}

/**
 * Datei-Download (z. B. Lohnzettel-PDF) mit Ladezustand und Fehler-Toast. `isPending` je Aufruf über `variables`:
 * `download.mutate({ key: 'x', run: () => api.download… })` → `download.isPending && download.variables?.key === 'x'`.
 */
export function useDownload() {
  return useMutation({
    mutationFn: ({ run }: { key: string; run: () => Promise<void> }) => run(),
    onError: notifyError('Download fehlgeschlagen'),
  })
}

export function useClosePeriod() {
  const invalidate = useInvalidateTimesheets()
  return useMutation({
    mutationFn: ({ userId, month }: { userId: number; month: string }) => adminApi.closePeriod(userId, month),
    onSuccess: () => {
      invalidate()
      toast.success('Periode abgeschlossen.')
    },
  })
}

export function useSaveSpecialItem() {
  const invalidate = useInvalidateTimesheets()
  return useMutation({
    mutationFn: ({ userId, id, data }: { userId: number; id?: number; data: SpecialItemPayload }) =>
      id ? adminApi.updateSpecialItem(userId, id, data) : adminApi.createSpecialItem(userId, data),
    onSuccess: (_r, vars) => {
      invalidate()
      toast.success(vars.id ? 'Sonderposten gespeichert.' : 'Sonderposten erfasst.')
    },
  })
}

export function useDeleteSpecialItem() {
  const invalidate = useInvalidateTimesheets()
  return useMutation({
    mutationFn: ({ userId, id }: { userId: number; id: number }) => adminApi.deleteSpecialItem(userId, id),
    onSuccess: () => {
      invalidate()
      toast.success('Sonderposten gelöscht.')
    },
    onError: notifyError('Sonderposten konnte nicht gelöscht werden'),
  })
}

export function useReopenPeriod() {
  const invalidate = useInvalidateTimesheets()
  return useMutation({
    mutationFn: ({ userId, month, reason }: { userId: number; month: string; reason: string }) =>
      adminApi.reopenPeriod(userId, month, reason),
    onSuccess: () => {
      invalidate()
      toast.success('Periode wieder geöffnet.')
    },
  })
}

// ---------- Protokoll & System ----------

export function useAuditLog(params: AuditQuery) {
  return useQuery({
    queryKey: queryKeys.audit(params),
    queryFn: () => adminApi.getAuditLog(params).then((r) => r.data),
    placeholderData: keepPreviousData,
  })
}

export function useBackupStatus() {
  return useQuery({
    queryKey: queryKeys.backup,
    queryFn: () => adminApi.getBackupStatus().then((r) => r.data),
    refetchInterval: 5 * 60_000,
  })
}

// ---------- Eigene Zeiterfassung (Mitarbeiter) ----------

export function useMyPayslips() {
  return useQuery({ queryKey: queryKeys.myPayslips, queryFn: () => employeeApi.getPayslips().then((r) => r.data.payslips) })
}

export function useMyPeriods() {
  return useQuery({ queryKey: queryKeys.myPeriods, queryFn: timeApi.getPeriods })
}

export function useMyMonth(month: string) {
  return useQuery({
    queryKey: queryKeys.myMonth(month),
    queryFn: () => timeApi.getMonth(month),
    enabled: !!month,
    placeholderData: keepPreviousData,
  })
}

function useInvalidateMyTime() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.myMonthAll })
    qc.invalidateQueries({ queryKey: queryKeys.myPeriods })
  }
}

export function useSaveTimeEntry() {
  const qc = useQueryClient()
  const invalidate = useInvalidateMyTime()
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: TimeEntryPayload }) => {
      if (id) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { date, ...rest } = data
        return timeApi.update(id, rest)
      }
      return timeApi.create(data)
    },
    onSuccess: (entry, vars) => {
      if (!vars.id && entry.billingDate) {
        const periods = qc.getQueryData<{ periods: BillingPeriod[] }>(queryKeys.myPeriods)?.periods
        const target = periodContaining(periods, entry.billingDate)
        toast.success('Als Nachtrag erfasst.', {
          description: `Der ${formatDate(entry.date)} gehört zu einer abgeschlossenen Periode. Abgerechnet wird der Eintrag ${
            target ? `im ${target.monthName} ${target.year}` : `in der Periode ab ${formatDate(entry.billingDate)}`
          }.`,
        })
      } else {
        toast.success(vars.id ? 'Eintrag gespeichert.' : 'Arbeitszeit erfasst.')
      }
      invalidate()
    },
  })
}

export function useDeleteTimeEntry() {
  const invalidate = useInvalidateMyTime()
  return useMutation({
    mutationFn: (id: number) => timeApi.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success('Eintrag gelöscht.')
    },
    onError: notifyError('Eintrag konnte nicht gelöscht werden'),
  })
}

// ---------- Eigenes Konto ----------

export function useMySettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.mySettings,
    queryFn: () => employeeApi.getSettings().then((r) => r.data.settings),
    enabled,
  })
}

export function useUpdatePayslipEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lohnzettelEmail: string) => employeeApi.updateSettings({ lohnzettelEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.mySettings })
      toast.success('Lohnzettel-E-Mail gespeichert.')
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
      employeeApi.changePassword(data),
    onSuccess: () => toast.success('Passwort geändert. Andere angemeldete Geräte wurden abgemeldet.'),
  })
}

// ---------- Eigene Sitzungen (angemeldete Geräte) ----------

export function useMySessions() {
  return useQuery({
    queryKey: queryKeys.mySessions,
    queryFn: () => authApi.getSessions().then((r) => r.data.sessions),
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sid: string) => authApi.revokeSession(sid),
    onSuccess: () => toast.success('Gerät abgemeldet.'),
    onError: notifyError('Gerät konnte nicht abgemeldet werden'),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.mySessions }),
  })
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => authApi.revokeOtherSessions(),
    onSuccess: (r) => {
      const n = r.data.revokedCount
      toast.success(n === 0 ? 'Sie waren nirgends sonst angemeldet.' : `${n} ${n === 1 ? 'anderes Gerät' : 'andere Geräte'} abgemeldet.`)
    },
    onError: notifyError('Andere Geräte konnten nicht abgemeldet werden'),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.mySessions }),
  })
}

export { authApi }
