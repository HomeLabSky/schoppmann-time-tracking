'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Clock, Euro, FileDown, Lock, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { employeeApi } from '@/lib/api'
import { useDeleteTimeEntry, useDownload, useMyMonth, useMyPeriods } from '@/lib/queries'
import type { TimeRecord } from '@/lib/timetracking'
import { formatCurrency, formatDate, formatEntryCount, formatHours, getErrorMessage } from '@/lib/utils'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/data-table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Progress, StatCard } from '@/components/ui/stat-card'
import { NachtragBadge } from '@/components/features/time/nachtrag-badge'
import { TimeEntryDialog } from '@/components/features/time/time-entry-dialog'
import { SpecialItemsSection } from '@/components/features/special-items/special-items'

export default function EmployeeDashboard() {
  const { user } = useAuth()
  const periods = useMyPeriods()
  const [selectedMonth, setMonth] = useState('')
  const [dialog, setDialog] = useState<TimeRecord | 'new' | null>(null)
  const remove = useDeleteTimeEntry()
  const download = useDownload()
  const [confirm, confirmDialog] = useConfirm()

  // Ist die aktuelle Periode schon (vorzeitig) abgeschlossen, landen neue Einträge als Nachtrag in der nächsten offenen
  // Periode – sie ist dann die Arbeitsperiode und wird angezeigt
  const currentPeriodValue = periods.data?.currentPeriod?.value
  const workingPeriodValue = useMemo(() => {
    if (!currentPeriodValue) return undefined
    const later = [...(periods.data?.periods ?? [])].filter((p) => p.value >= currentPeriodValue).sort((a, b) => a.value.localeCompare(b.value))
    return (later.find((p) => !p.isClosed) ?? later[0])?.value ?? currentPeriodValue
  }, [periods.data, currentPeriodValue])

  // Ohne eigene Auswahl: aktuelle (offene) Periode
  const month = selectedMonth || workingPeriodValue || periods.data?.periods.at(-1)?.value || ''

  const sheet = useMyMonth(month)
  const data = sheet.data
  const summary = data?.summary
  const closed = data?.period.status === 'closed'
  const closureId = data?.closure?.id
  const limitMissing = !closed && !!summary?.minijobLimitMissing

  // Perioden chronologisch (älteste zuerst) für Vor/Zurück; künftige Perioden außer der Arbeitsperiode ausblenden
  const periodList = useMemo(
    () =>
      [...(periods.data?.periods ?? [])]
        .filter((p) => !workingPeriodValue || p.value <= workingPeriodValue)
        .sort((a, b) => a.value.localeCompare(b.value)),
    [periods.data, workingPeriodValue]
  )
  const index = periodList.findIndex((p) => p.value === month)

  const usagePct = summary && summary.minijobLimit > 0 ? (summary.actualEarnings / summary.minijobLimit) * 100 : 0
  const usageTone = limitMissing ? 'warning' : usagePct >= 100 ? 'danger' : usagePct >= 80 ? 'warning' : 'success'

  // Vorschlag für neue Einträge: Zeiten des letzten Eintrags
  const lastEntry = useMemo(
    () => [...(data?.records ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))[0],
    [data?.records]
  )

  const { mutate: deleteEntry } = remove
  const columns = useMemo<ColumnDef<TimeRecord, unknown>[]>(() => {
    const askDelete = async (r: TimeRecord) => {
      const ok = await confirm({
        title: 'Eintrag löschen?',
        message: `${formatDate(r.date)}, ${r.startTime} – ${r.endTime}. Die Löschung wird protokolliert.`,
        confirmLabel: 'Löschen',
        destructive: true,
      })
      if (ok) deleteEntry(r.id)
    }
    return [
      {
        id: 'date',
        accessorFn: (r) => r.date,
        header: 'Datum',
        cell: ({ row }) => (
          <span className="tabular">
            {new Date(`${row.original.date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' })}, {formatDate(row.original.date)}
            <NachtragBadge entry={row.original} />
          </span>
        ),
      },
      {
        id: 'time',
        accessorFn: (r) => r.startTime,
        header: 'Zeit',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.startTime} – {row.original.endTime}
            {row.original.endTime < row.original.startTime && <span className="ml-1 text-xs text-muted-foreground">(+1 Tag)</span>}
          </span>
        ),
      },
      {
        id: 'break',
        accessorFn: (r) => r.breakMinutes,
        header: 'Pause',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => (row.original.breakMinutes ? `${row.original.breakMinutes} Min.` : '–'),
      },
      {
        id: 'hours',
        accessorFn: (r) => r.totalHours,
        header: 'Arbeitszeit',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => formatHours(row.original.totalHours),
      },
      {
        id: 'earnings',
        accessorFn: (r) => r.earnings,
        header: 'Verdienst',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => formatCurrency(row.original.earnings),
      },
      {
        id: 'description',
        accessorFn: (r) => r.description ?? '',
        header: 'Tätigkeit',
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.description || '–'}</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aktionen</span>,
        enableSorting: false,
        meta: { className: 'w-12 text-right' },
        cell: ({ row }) =>
          closed ? (
            <Lock className="ml-auto h-4 w-4 text-muted-foreground" aria-label="Periode abgeschlossen" />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Aktionen für den Eintrag vom ${formatDate(row.original.date)}, ${row.original.startTime} Uhr`}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog(row.original)}>
                  <Pencil aria-hidden="true" /> Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => askDelete(row.original)}>
                  <Trash2 aria-hidden="true" /> Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
      },
    ]
  }, [closed, confirm, deleteEntry])

  const loading = periods.isLoading || (!!month && sheet.isLoading)

  return (
    <>
      <PageHeader
        title="Zeiterfassung"
        description={user ? `Hallo ${user.name.split(' ')[0]} – hier erfassen Sie Ihre Arbeitszeiten.` : undefined}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Vorherige Periode"
                disabled={index <= 0}
                onClick={() => setMonth(periodList[index - 1].value)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <label htmlFor="employee-period" className="sr-only">
                Abrechnungsperiode
              </label>
              <Select id="employee-period" value={month} onChange={(e) => setMonth(e.target.value)} className="w-72">
                {periodList.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                    {p.isClosed ? ' · abgeschlossen' : ''}
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="icon"
                aria-label="Nächste Periode"
                disabled={index === -1 || index >= periodList.length - 1}
                onClick={() => setMonth(periodList[index + 1].value)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <Button onClick={() => setDialog('new')} disabled={closed}>
              <Plus aria-hidden="true" /> Arbeitszeit erfassen
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {(periods.isError || sheet.isError) && (
          <Alert variant="danger" title="Daten konnten nicht geladen werden">
            {getErrorMessage(periods.error ?? sheet.error)}
          </Alert>
        )}
        {closed && (
          <Alert
            variant="info"
            title="Diese Periode ist abgeschlossen"
            action={
              closureId !== undefined && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={download.isPending}
                  onClick={() => download.mutate({ key: String(closureId), run: () => employeeApi.downloadPayslip(closureId) })}
                >
                  <FileDown aria-hidden="true" /> Lohnzettel (PDF)
                </Button>
              )
            }
          >
            Einträge können hier nicht mehr geändert oder gelöscht werden. Vergessene Arbeitszeiten können Sie in der laufenden
            Periode trotzdem erfassen – sie werden als Nachtrag in der nächsten offenen Periode abgerechnet. Für Korrekturen
            wenden Sie sich bitte an Ihren Administrator.
          </Alert>
        )}
        {limitMissing && (
          <Alert variant="warning" title="Beträge sind vorläufig">
            Für diesen Zeitraum ist noch keine Minijob-Grenze hinterlegt. Auszahlung und Übertrag können sich noch ändern.
          </Alert>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Arbeitszeit"
          value={summary ? formatHours(summary.totalHours) : ''}
          icon={Clock}
          loading={loading}
          hint={data ? `${formatDate(data.period.startDate)} – ${formatDate(data.period.endDate)}` : undefined}
        />
        <StatCard
          label="Verdienst"
          value={summary ? formatCurrency(summary.totalEarnings) : ''}
          icon={Euro}
          loading={loading}
          hint={
            summary
              ? `${formatEntryCount(summary.entryCount, summary.workDays)}` +
                `${summary.specialItemsTotal > 0 ? ` · + ${formatCurrency(summary.specialItemsTotal)} Sonderposten` : ''}` +
                `${summary.carryIn > 0 ? ` · + ${formatCurrency(summary.carryIn)} Übertrag` : ''}`
              : undefined
          }
        />
        <StatCard
          label="Auszahlung"
          value={summary ? formatCurrency(summary.payout) : ''}
          icon={Wallet}
          tone={limitMissing ? 'warning' : 'default'}
          loading={loading}
          hint={summary ? (limitMissing ? 'vorläufig' : `Grenze ${formatCurrency(summary.minijobLimit)}`) : undefined}
        >
          {summary && !loading && <Progress value={usagePct} tone={usageTone} label="Ausschöpfung der Minijob-Grenze" />}
        </StatCard>
        <StatCard
          label="Übertrag in nächste Periode"
          value={summary ? formatCurrency(summary.carryOut) : ''}
          tone={summary && summary.carryOut > 0 ? 'warning' : 'default'}
          loading={loading}
          hint={summary && summary.carryOut > 0 ? 'Über der Grenze – wird später ausgezahlt' : undefined}
        />
      </div>

      <div className="mt-6">
        <DataTable
          caption="Ihre Zeiteinträge in dieser Periode"
          columns={columns}
          data={data?.records ?? []}
          loading={loading}
          getRowId={(r) => String(r.id)}
          initialSorting={[{ id: 'date', desc: true }]}
          pageSize={50}
          empty={{
            title: 'Noch keine Einträge',
            description: closed ? 'In dieser Periode wurde nichts erfasst.' : 'Erfassen Sie Ihre erste Arbeitszeit in dieser Periode.',
            action: closed ? undefined : (
              <Button size="sm" onClick={() => setDialog('new')}>
                <Plus aria-hidden="true" /> Arbeitszeit erfassen
              </Button>
            ),
          }}
        />
      </div>

      {data && data.specialItems.length > 0 && (
        <div className="mt-6">
          <SpecialItemsSection items={data.specialItems} total={data.summary.specialItemsTotal} />
        </div>
      )}

      <TimeEntryDialog
        entry={dialog}
        onClose={() => setDialog(null)}
        records={data?.records}
        defaults={lastEntry ? { startTime: lastEntry.startTime, endTime: lastEntry.endTime, breakMinutes: lastEntry.breakMinutes } : undefined}
      />
      {confirmDialog}
    </>
  )
}
