'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { FileDown } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { useDownload, useTimesheetOverview } from '@/lib/queries'
import { csvNumber } from '@/lib/csv'
import { formatCurrency, formatDate, formatHours, getErrorMessage } from '@/lib/utils'
import type { TimesheetOverviewRow } from '@/types/audit'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { Select } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import { formatMonth, PeriodStatusBadge } from '../period-status'

type StatusFilter = 'all' | 'ready' | 'open' | 'closed' | 'attention'

const statusLabel = (r: TimesheetOverviewRow) =>
  r.status === 'closed' ? 'Abgeschlossen' : r.minijobLimitMissing ? 'Grenze fehlt' : r.status === 'ready' ? 'Bereit zum Abschluss' : 'Läuft'

export function TimesheetOverview({ month, onOpen }: { month: string; onOpen: (userId: number) => void }) {
  const overview = useTimesheetOverview(month)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [showEmpty, setShowEmpty] = useState(false)
  const download = useDownload()
  // Mitarbeiter ohne Stunden und ohne Übertrag haben nichts abzurechnen (z. B. noch nicht eingestellt) – ausgeblendet
  const allRows = useMemo(() => overview.data ?? [], [overview.data])
  const rows = useMemo(() => allRows.filter((r) => r.billable), [allRows])
  const hiddenCount = allRows.length - rows.length

  const data = useMemo(
    () =>
      (showEmpty ? allRows : rows).filter((r) => {
        if (filter === 'all') return true
        if (filter === 'attention') return r.minijobLimitMissing || r.exceedsLimit
        return r.status === filter
      }),
    [rows, allRows, showEmpty, filter]
  )

  const totals = useMemo(
    () => ({
      hours: rows.reduce((s, r) => s + r.totalHours, 0),
      payout: rows.reduce((s, r) => s + r.payout, 0),
      ready: rows.filter((r) => r.status === 'ready').length,
      closed: rows.filter((r) => r.status === 'closed').length,
    }),
    [rows]
  )

  const columns = useMemo<ColumnDef<TimesheetOverviewRow, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => r.name,
        header: 'Mitarbeiter',
        cell: ({ row }) => (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(row.original.userId)}
              className="truncate text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {row.original.name}
            </button>
            {!row.original.isActive && <span className="ml-1.5 text-xs text-muted-foreground">(deaktiviert)</span>}
            <p className="tabular truncate text-xs text-muted-foreground">
              {formatDate(row.original.periodStart)} – {formatDate(row.original.periodEnd)}
            </p>
          </div>
        ),
      },
      { id: 'entries', accessorFn: (r) => r.entryCount, header: 'Einträge', meta: { className: 'text-right tabular' } },
      { id: 'days', accessorFn: (r) => r.workDays, header: 'Tage', meta: { className: 'text-right tabular' } },
      {
        id: 'hours',
        accessorFn: (r) => r.totalHours,
        header: 'Stunden',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => formatHours(row.original.totalHours),
      },
      {
        id: 'earnings',
        accessorFn: (r) => r.totalEarnings,
        header: 'Verdienst',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => formatCurrency(row.original.totalEarnings),
      },
      {
        id: 'paid',
        accessorFn: (r) => r.payout,
        header: 'Auszahlung',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => (
          <div>
            <span className={row.original.minijobLimitMissing ? 'text-warning' : undefined}>{formatCurrency(row.original.payout)}</span>
            {row.original.specialItemsTotal > 0 && (
              <p className="text-xs text-muted-foreground">inkl. {formatCurrency(row.original.specialItemsTotal)} Sonderposten</p>
            )}
          </div>
        ),
      },
      {
        id: 'carry',
        accessorFn: (r) => r.carryOut,
        header: 'Übertrag',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => (
          <span className={row.original.carryOut > 0 ? 'font-medium text-warning' : 'text-muted-foreground'}>{formatCurrency(row.original.carryOut)}</span>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => statusLabel(r),
        header: 'Status',
        cell: ({ row }) => (
          <PeriodStatusBadge status={row.original.status} limitMissing={row.original.minijobLimitMissing} empty={!row.original.billable} />
        ),
      },
    ],
    [onOpen]
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stunden" value={formatHours(totals.hours)} loading={overview.isLoading} hint={formatMonth(month)} />
        <StatCard label="Auszahlung" value={formatCurrency(totals.payout)} loading={overview.isLoading} hint="Summe aller Mitarbeiter" />
        <StatCard label="Bereit zum Abschluss" value={totals.ready} tone={totals.ready > 0 ? 'warning' : 'default'} loading={overview.isLoading} />
        <StatCard label="Abgeschlossen" value={`${totals.closed} von ${rows.length}`} tone={rows.length > 0 && totals.closed === rows.length ? 'success' : 'default'} loading={overview.isLoading} />
      </div>

      {overview.isError && (
        <Alert variant="danger" title="Übersicht konnte nicht geladen werden">
          {getErrorMessage(overview.error)}
        </Alert>
      )}

      <DataTable
        caption={`Zeitnachweise aller Mitarbeiter für ${formatMonth(month)}`}
        columns={columns}
        data={data}
        loading={overview.isLoading}
        getRowId={(r) => String(r.userId)}
        initialSorting={[{ id: 'name', desc: false }]}
        searchPlaceholder="Mitarbeiter suchen…"
        searchText={(r) => `${r.name} ${r.email}`}
        empty={{ title: 'Keine Mitarbeiter', description: 'Für diesen Monat gibt es keine Mitarbeiter mit Stunden oder Übertrag.' }}
        toolbar={
          <>
            <Select aria-label="Nach Status filtern" value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)} className="w-auto">
              <option value="all">Alle Status</option>
              <option value="ready">Bereit zum Abschluss</option>
              <option value="open">Läuft noch</option>
              <option value="closed">Abgeschlossen</option>
              <option value="attention">Grenze fehlt / überschritten</option>
            </Select>
            {/* Monatsabschluss: alle abgeschlossenen Lohnzettel in einer Datei, einer je Seite */}
            <Button
              variant="outline"
              disabled={totals.closed === 0}
              loading={download.isPending}
              title={
                totals.closed === 0
                  ? 'Noch keine Periode abgeschlossen'
                  : `${totals.closed} Lohnzettel in einer PDF, einer je Seite${totals.closed < rows.length ? ' (nur abgeschlossene Perioden)' : ''}`
              }
              onClick={() => download.mutate({ key: month, run: () => adminApi.downloadAllPayslips(month) })}
            >
              <FileDown aria-hidden="true" /> Alle Lohnzettel (PDF)
            </Button>
          </>
        }
        csv={{
          filename: `zeitnachweise-${month}`,
          columns: [
            { header: 'Mitarbeiter', value: (r) => r.name },
            { header: 'E-Mail', value: (r) => r.email },
            { header: 'Periode von', value: (r) => formatDate(r.periodStart) },
            { header: 'Periode bis', value: (r) => formatDate(r.periodEnd) },
            { header: 'Einträge', value: (r) => r.entryCount },
            { header: 'Tage', value: (r) => r.workDays },
            { header: 'Stunden', value: (r) => csvNumber(r.totalHours) },
            { header: 'Verdienst (€)', value: (r) => csvNumber(r.totalEarnings) },
            { header: 'Lohn (€)', value: (r) => csvNumber(r.paidThisMonth) },
            { header: 'Sonderposten (€)', value: (r) => csvNumber(r.specialItemsTotal) },
            { header: 'Auszahlung (€)', value: (r) => csvNumber(r.payout) },
            { header: 'Übertrag (€)', value: (r) => csvNumber(r.carryOut) },
            { header: 'Grenze (€)', value: (r) => (r.minijobLimitMissing ? '' : csvNumber(r.minijobLimit)) },
            { header: 'Status', value: (r) => statusLabel(r) },
          ],
        }}
      />
      {hiddenCount > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="hidden-empty">
          {hiddenCount === 1 ? '1 Mitarbeiter' : `${hiddenCount} Mitarbeiter`} ohne Stunden in dieser Periode{' '}
          {showEmpty ? 'werden angezeigt' : 'ausgeblendet'} – es gibt nichts abzuschließen.{' '}
          <Button variant="link" size="sm" className="h-auto p-0 text-sm" onClick={() => setShowEmpty((v) => !v)}>
            {showEmpty ? 'Ausblenden' : 'Einblenden'}
          </Button>
        </p>
      )}
    </div>
  )
}
