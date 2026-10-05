'use client'

import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCurrentMinijobSetting, useDeleteMinijobSetting, useMinijobSettings, useRecalculateMinijob } from '@/lib/queries'
import { formatCurrency, formatDate, getErrorMessage, toLocalDateString } from '@/lib/utils'
import type { MinijobSetting } from '@/types/api'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DataTable } from '@/components/ui/data-table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { MinijobDialog } from '@/components/features/minijob/minijob-dialog'

type Validity = 'current' | 'future' | 'past'

const validityOf = (s: MinijobSetting, today: string): Validity =>
  s.validFrom > today ? 'future' : s.validUntil && s.validUntil < today ? 'past' : 'current'

const validityBadge: Record<Validity, React.ReactNode> = {
  current: <Badge variant="success">Gültig</Badge>,
  future: <Badge variant="info">Geplant</Badge>,
  past: <Badge variant="neutral">Abgelaufen</Badge>,
}

export default function MinijobPage() {
  const settings = useMinijobSettings()
  const current = useCurrentMinijobSetting()
  const remove = useDeleteMinijobSetting()
  const recalc = useRecalculateMinijob()
  const [confirm, confirmDialog] = useConfirm()
  const [dialog, setDialog] = useState<MinijobSetting | 'new' | null>(null)
  const today = toLocalDateString()

  const upcoming = useMemo(
    () => (settings.data ?? []).filter((s) => s.validFrom > today).sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0],
    [settings.data, today]
  )

  const { mutate: deleteSetting } = remove

  const columns = useMemo<ColumnDef<MinijobSetting, unknown>[]>(() => {
    const askDelete = async (s: MinijobSetting) => {
      const ok = await confirm({
        title: `Grenze „${s.description}“ löschen?`,
        message: 'Vorherige Grenzen werden automatisch angepasst. Abgeschlossene Perioden behalten ihre festgeschriebene Grenze.',
        confirmLabel: 'Löschen',
        destructive: true,
      })
      if (ok) deleteSetting(s.id)
    }
    return [
      {
        id: 'limit',
        accessorFn: (s) => Number(s.monthlyLimit),
        header: 'Grenze',
        meta: { className: 'text-right' },
        cell: ({ row }) => <span className="tabular font-medium">{formatCurrency(Number(row.original.monthlyLimit))}</span>,
      },
      { id: 'description', accessorFn: (s) => s.description, header: 'Beschreibung' },
      {
        id: 'from',
        accessorFn: (s) => s.validFrom,
        header: 'Gültig ab',
        cell: ({ row }) => <span className="tabular">{formatDate(row.original.validFrom)}</span>,
      },
      {
        id: 'until',
        accessorFn: (s) => s.validUntil ?? '9999-12-31',
        header: 'Gültig bis',
        cell: ({ row }) => <span className="tabular">{row.original.validUntil ? formatDate(row.original.validUntil) : 'unbegrenzt'}</span>,
      },
      {
        id: 'status',
        accessorFn: (s) => validityOf(s, today),
        header: 'Status',
        cell: ({ row }) => validityBadge[validityOf(row.original, today)],
      },
      {
        id: 'creator',
        accessorFn: (s) => s.Creator?.name ?? '',
        header: 'Angelegt von',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.Creator?.name ?? '–'}</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aktionen</span>,
        enableSorting: false,
        meta: { className: 'w-12 text-right' },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Aktionen für ${row.original.description}`}>
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
  }, [confirm, deleteSetting, today])

  const askRecalc = async () => {
    const ok = await confirm({
      title: 'Gültigkeitszeiträume neu berechnen?',
      message: 'Lücken und Überschneidungen zwischen den Grenzen werden korrigiert. Der Vorgang wird protokolliert.',
      confirmLabel: 'Neu berechnen',
    })
    if (ok) recalc.mutate()
  }

  return (
    <>
      <PageHeader
        title="Minijob-Grenzen"
        description="Monatliche Verdienstgrenzen mit Gültigkeitszeitraum. Je Periode gilt die Grenze, die an ihrem Enddatum gültig war."
        actions={
          <>
            <Button variant="outline" onClick={askRecalc} loading={recalc.isPending}>
              {!recalc.isPending && <RefreshCw aria-hidden="true" />}
              Zeiträume prüfen
            </Button>
            <Button onClick={() => setDialog('new')}>
              <Plus aria-hidden="true" /> Grenze anlegen
            </Button>
          </>
        }
      />

      {current.data === null && (
        <Alert variant="warning" title="Für heute ist keine Grenze hinterlegt" className="mb-6">
          Ohne gültige Grenze werden Auszahlungen nur vorläufig berechnet und Perioden lassen sich nicht abschließen. Legen Sie eine Grenze an
          – bei Bedarf rückwirkend.
        </Alert>
      )}
      {settings.isError && (
        <Alert variant="danger" title="Grenzen konnten nicht geladen werden" className="mb-6">
          {getErrorMessage(settings.error)}
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Aktuelle Grenze"
          value={current.data ? formatCurrency(Number(current.data.monthlyLimit)) : 'Nicht hinterlegt'}
          tone={current.data === null ? 'warning' : 'default'}
          loading={current.isLoading}
          hint={current.data ? `seit ${formatDate(current.data.validFrom)} · ${current.data.description}` : undefined}
        />
        <StatCard
          label="Nächste Änderung"
          value={upcoming ? formatCurrency(Number(upcoming.monthlyLimit)) : 'Keine geplant'}
          loading={settings.isLoading}
          hint={upcoming ? `ab ${formatDate(upcoming.validFrom)}` : 'Neue Grenzen rechtzeitig vor dem Jahreswechsel anlegen.'}
        />
      </div>

      <DataTable
        caption="Minijob-Grenzen"
        columns={columns}
        data={settings.data ?? []}
        loading={settings.isLoading}
        getRowId={(s) => String(s.id)}
        initialSorting={[{ id: 'from', desc: true }]}
        empty={{
          title: 'Noch keine Grenzen',
          description: 'Legen Sie die aktuell gültige Minijob-Grenze an.',
          action: (
            <Button size="sm" onClick={() => setDialog('new')}>
              <Plus aria-hidden="true" /> Grenze anlegen
            </Button>
          ),
        }}
      />

      <MinijobDialog setting={dialog} onClose={() => setDialog(null)} />
      {confirmDialog}
    </>
  )
}
