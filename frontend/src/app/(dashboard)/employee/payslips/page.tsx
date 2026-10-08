'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { FileDown } from 'lucide-react'
import { employeeApi } from '@/lib/api'
import { useDownload, useMyPayslips } from '@/lib/queries'
import { formatCurrency, formatDate, formatDateTime, formatHours, getErrorMessage } from '@/lib/utils'
import type { Payslip } from '@/types/api'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'

export default function EmployeePayslipsPage() {
  const payslips = useMyPayslips()
  const download = useDownload()

  const columns = useMemo<ColumnDef<Payslip, unknown>[]>(
    () => [
      {
        id: 'period',
        accessorFn: (p) => p.periodStart,
        header: 'Periode',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.label}</p>
            <p className="tabular text-xs text-muted-foreground">
              {formatDate(row.original.periodStart)} – {formatDate(row.original.periodEnd)}
            </p>
          </div>
        ),
      },
      { id: 'hours', accessorFn: (p) => p.totalHours, header: 'Arbeitszeit', meta: { className: 'text-right tabular' }, cell: ({ row }) => formatHours(row.original.totalHours) },
      {
        id: 'earnings',
        accessorFn: (p) => p.earnings,
        header: 'Verdienst',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => (
          <div>
            {formatCurrency(row.original.earnings)}
            {row.original.specialItems > 0 && (
              <p className="text-xs text-muted-foreground">+ {formatCurrency(row.original.specialItems)} Sonderposten</p>
            )}
          </div>
        ),
      },
      {
        id: 'paid',
        accessorFn: (p) => p.paid,
        header: 'Auszahlung',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => <span className="font-medium">{formatCurrency(row.original.paid)}</span>,
      },
      {
        id: 'carry',
        accessorFn: (p) => p.carryOut,
        header: 'Übertrag',
        meta: { className: 'text-right tabular' },
        cell: ({ row }) => <span className={row.original.carryOut > 0 ? 'text-warning' : 'text-muted-foreground'}>{formatCurrency(row.original.carryOut)}</span>,
      },
      { id: 'closedAt', accessorFn: (p) => p.closedAt, header: 'Abgeschlossen am', cell: ({ row }) => <span className="tabular">{formatDateTime(row.original.closedAt)}</span> },
      {
        id: 'pdf',
        header: () => <span className="sr-only">Herunterladen</span>,
        enableSorting: false,
        meta: { className: 'text-right' },
        cell: ({ row }) => {
          const key = String(row.original.id)
          return (
            <Button
              size="sm"
              variant="outline"
              loading={download.isPending && download.variables?.key === key}
              onClick={() => download.mutate({ key, run: () => employeeApi.downloadPayslip(row.original.id) })}
              aria-label={`Lohnzettel ${row.original.label} als PDF herunterladen`}
            >
              <FileDown aria-hidden="true" /> PDF
            </Button>
          )
        },
      },
    ],
    [download]
  )

  return (
    <>
      <PageHeader
        title="Lohnzettel"
        description="Für jede abgeschlossene Abrechnungsperiode steht hier Ihr Lohnzettel zum Herunterladen und Ausdrucken bereit."
      />
      {payslips.isError && (
        <Alert variant="danger" title="Lohnzettel konnten nicht geladen werden" className="mb-4">
          {getErrorMessage(payslips.error)}
        </Alert>
      )}
      <DataTable
        caption="Ihre Lohnzettel"
        columns={columns}
        data={payslips.data ?? []}
        loading={payslips.isLoading}
        getRowId={(p) => String(p.id)}
        initialSorting={[{ id: 'period', desc: true }]}
        empty={{
          title: 'Noch keine Lohnzettel',
          description: 'Sobald Ihr Administrator eine Abrechnungsperiode abgeschlossen hat, erscheint der Lohnzettel hier.',
        }}
      />
    </>
  )
}
