'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, CalendarCheck, Clock, Euro, HardDrive, ScrollText, Users } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAuditLog, useBackupStatus, useCurrentMinijobSetting, useTimesheetOverview } from '@/lib/queries'
import { ACTION_LABELS } from '@/lib/auditLabels'
import { formatCurrency, formatDateTime, formatHours, formatRelativeTime } from '@/lib/utils'
import type { TimesheetOverviewRow } from '@/types/audit'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress, StatCard } from '@/components/ui/stat-card'
import { formatMonth, monthFromToday, PeriodStatusBadge } from '@/components/features/period-status'

const usage = (r: TimesheetOverviewRow) => (r.minijobLimit > 0 ? ((r.paidThisMonth + r.carryOut) / r.minijobLimit) * 100 : 0)
const usageTone = (pct: number) => (pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success') as 'danger' | 'warning' | 'success'

export default function AdminOverviewPage() {
  const { user } = useAuth()
  const currentMonth = monthFromToday(0)
  const previousMonth = monthFromToday(-1)

  const current = useTimesheetOverview(currentMonth)
  const previous = useTimesheetOverview(previousMonth)
  const limit = useCurrentMinijobSetting()
  const backup = useBackupStatus()
  const activity = useAuditLog({ limit: 6, exclude: 'auth' })

  const kpi = useMemo(() => {
    const rows = current.data ?? []
    return {
      employees: rows.filter((r) => r.isActive).length,
      hours: rows.reduce((sum, r) => sum + r.totalHours, 0),
      payout: rows.reduce((sum, r) => sum + r.paidThisMonth, 0),
    }
  }, [current.data])

  const toClose = (previous.data ?? []).filter((r) => r.status === 'ready' && r.entryCount > 0)
  const closedCount = (previous.data ?? []).filter((r) => r.status === 'closed').length
  const nearLimit = (current.data ?? [])
    .filter((r) => r.entryCount > 0)
    .map((r) => ({ row: r, pct: usage(r) }))
    .sort((a, b) => b.pct - a.pct)

  return (
    <>
      <PageHeader
        title={`Guten Tag${user ? `, ${user.name.split(' ')[0]}` : ''}`}
        description={`Laufende Abrechnung: ${formatMonth(currentMonth)}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/timesheets">
              <CalendarCheck aria-hidden="true" /> Zeitnachweise
            </Link>
          </Button>
        }
      />

      <div className="space-y-4">
        {limit.data === null && (
          <Alert
            variant="warning"
            title="Keine aktuelle Minijob-Grenze hinterlegt"
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/minijob">Grenze anlegen</Link>
              </Button>
            }
          >
            Auszahlungen werden nur vorläufig berechnet, und Perioden lassen sich nicht abschließen.
          </Alert>
        )}
        {backup.data && (backup.data.state === 'error' || backup.data.state === 'warning') && (
          <Alert variant={backup.data.state === 'error' ? 'danger' : 'warning'} title={backup.data.state === 'error' ? 'Datensicherung gestört' : 'Hinweis zur Datensicherung'}>
            {backup.data.message}
          </Alert>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Aktive Mitarbeiter" value={kpi.employees} icon={Users} loading={current.isLoading} hint="mit Konto und Abrechnung" />
        <StatCard label="Stunden laufende Periode" value={formatHours(kpi.hours)} icon={Clock} loading={current.isLoading} hint={formatMonth(currentMonth)} />
        <StatCard label="Auszahlung laufende Periode" value={formatCurrency(kpi.payout)} icon={Euro} loading={current.isLoading} hint="vorläufig, bis zum Abschluss" />
        <StatCard
          label={`Offene Abschlüsse ${formatMonth(previousMonth)}`}
          value={toClose.length}
          tone={toClose.length > 0 ? 'warning' : 'success'}
          icon={CalendarCheck}
          loading={previous.isLoading}
          hint={`${closedCount} bereits abgeschlossen`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle>Abschluss {formatMonth(previousMonth)}</CardTitle>
              <CardDescription>Beendete Perioden mit Einträgen, die noch festgeschrieben werden müssen.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/admin/timesheets?month=${previousMonth}`}>
                Alle anzeigen <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {previous.isLoading ? (
              <div className="space-y-3 px-5 pb-5">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : toClose.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Alles abgeschlossen" description="Für den Vormonat sind keine Abschlüsse offen." />
            ) : (
              <ul className="divide-y border-t">
                {toClose.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="tabular text-xs text-muted-foreground">
                        {r.entryCount} Einträge · {formatHours(r.totalHours)} · {formatCurrency(r.totalEarnings)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <PeriodStatusBadge status={r.status} limitMissing={r.minijobLimitMissing} />
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/timesheets?user=${r.userId}&month=${previousMonth}`}>Prüfen</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auslastung Minijob-Grenze</CardTitle>
            <CardDescription>Laufende Periode inkl. Übertrag</CardDescription>
          </CardHeader>
          <CardContent>
            {current.isLoading ? (
              <Skeleton className="h-24" />
            ) : nearLimit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Einträge in dieser Periode.</p>
            ) : (
              <ul className="space-y-4">
                {nearLimit.slice(0, 6).map(({ row, pct }) => (
                  <li key={row.userId}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="tabular text-xs text-muted-foreground">
                        {row.minijobLimitMissing ? 'Grenze fehlt' : `${Math.round(pct)} %`}
                      </span>
                    </div>
                    <Progress value={pct} tone={row.minijobLimitMissing ? 'warning' : usageTone(pct)} label={`Auslastung ${row.name}`} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle>Letzte Änderungen</CardTitle>
              <CardDescription>Aus dem Änderungsprotokoll (ohne Anmeldungen)</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/audit">
                <ScrollText aria-hidden="true" /> Protokoll
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {activity.isLoading ? (
              <div className="space-y-3 px-5 pb-5">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : (activity.data?.entries ?? []).length === 0 ? (
              <EmptyState icon={ScrollText} title="Noch keine Änderungen" />
            ) : (
              <ul className="divide-y border-t">
                {activity.data!.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ACTION_LABELS[e.action] ?? e.action}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.actorEmail}</p>
                    </div>
                    <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)} className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(e.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1">
              <CardTitle>Datensicherung</CardTitle>
              <CardDescription>Täglich lokal und auf das NAS</CardDescription>
            </div>
            <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {backup.isLoading ? (
              <Skeleton className="h-16" />
            ) : !backup.data ? (
              <p className="text-muted-foreground">Der Sicherungsstatus konnte nicht geladen werden.</p>
            ) : (
              <>
                <Badge
                  variant={
                    backup.data.state === 'ok' ? 'success' : backup.data.state === 'error' ? 'danger' : backup.data.state === 'warning' ? 'warning' : 'neutral'
                  }
                >
                  {{ ok: 'In Ordnung', warning: 'Warnung', error: 'Gestört', unknown: 'Unbekannt' }[backup.data.state]}
                </Badge>
                <p className="text-muted-foreground">{backup.data.message}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Lokal</dt>
                  <dd className="tabular">{backup.data.lastSuccessAt ? formatDateTime(backup.data.lastSuccessAt) : '–'}</dd>
                  {backup.data.offsiteConfigured && (
                    <>
                      <dt className="text-muted-foreground">NAS</dt>
                      <dd className="tabular">{backup.data.offsiteLastSuccessAt ? formatDateTime(backup.data.offsiteLastSuccessAt) : '–'}</dd>
                    </>
                  )}
                </dl>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
