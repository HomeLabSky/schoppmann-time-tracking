'use client'

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Inbox, Search } from 'lucide-react'
import { Button } from './button'
import { Input } from './input'
import { Skeleton } from './skeleton'
import { EmptyState } from './empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
import { downloadCsv, type CsvColumn } from '@/lib/csv'
import { cn } from '@/lib/utils'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Zusätzliche Klassen für Kopf- und Datenzelle (z. B. `text-right`). */
    className?: string
  }
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  loading?: boolean
  /** Beschriftung der Tabelle für Screenreader. */
  caption: string
  /** Platzhalter des Suchfelds; ohne Angabe gibt es keine Suche. */
  searchPlaceholder?: string
  /** Liefert den durchsuchbaren Text einer Zeile (Standard: alle Zellwerte). */
  searchText?: (row: T) => string
  /** Weitere Filter/Knöpfe in der Werkzeugleiste (links neben Export). */
  toolbar?: React.ReactNode
  /** CSV-Export der aktuell gefilterten und sortierten Zeilen. */
  csv?: { filename: string; columns: CsvColumn<T>[] }
  pageSize?: number
  initialSorting?: SortingState
  empty?: { title: string; description?: string; action?: React.ReactNode }
  getRowId?: (row: T) => string
  rowClassName?: (row: T) => string | undefined
}

/**
 * Tabelle mit Suche, Sortierung (Klick auf Spaltenkopf), Seitenweise-Anzeige und CSV-Export.
 * Läuft vollständig im Browser – für die Datenmengen dieser Anwendung (Dutzende bis wenige Tausend Zeilen) ausreichend.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  caption,
  searchPlaceholder,
  searchText,
  toolbar,
  csv,
  pageSize = 25,
  initialSorting = [],
  empty = { title: 'Keine Einträge' },
  getRowId,
  rowClassName,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [globalFilter, setGlobalFilter] = React.useState('')

  const globalFilterFn: FilterFn<T> = React.useCallback(
    (row, _columnId, value: string) => {
      const needle = value.trim().toLowerCase()
      if (!needle) return true
      const haystack = searchText
        ? searchText(row.original)
        : row.getAllCells().map((cell) => String(cell.getValue() ?? '')).join(' ')
      return haystack.toLowerCase().includes(needle)
    },
    [searchText]
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const rows = table.getRowModel().rows
  const filteredCount = table.getFilteredRowModel().rows.length
  const { pageIndex } = table.getState().pagination
  const showToolbar = Boolean(searchPlaceholder || toolbar || csv)

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={globalFilter}
                onChange={(e) => {
                  setGlobalFilter(e.target.value)
                  table.setPageIndex(0)
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-8"
              />
            </div>
          )}
          {toolbar}
          {csv && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={loading || filteredCount === 0}
              onClick={() => downloadCsv(csv.filename, table.getPrePaginationRowModel().rows.map((r) => r.original), csv.columns)}
            >
              <Download aria-hidden="true" />
              CSV exportieren
            </Button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <TableHead
                      key={header.id}
                      className={header.column.columnDef.meta?.className}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : sortable ? 'none' : undefined}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {content}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  {globalFilter ? (
                    <EmptyState icon={Search} title="Keine Treffer" description={`Nichts gefunden für „${globalFilter}“.`} />
                  ) : (
                    <EmptyState icon={Inbox} title={empty.title} description={empty.description} action={empty.action} />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className={rowClassName?.(row.original)}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && filteredCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular">
            {filteredCount === data.length
              ? `${data.length} ${data.length === 1 ? 'Eintrag' : 'Einträge'}`
              : `${filteredCount} von ${data.length} Einträgen`}
          </span>
          {table.getPageCount() > 1 && (
            <div className="flex items-center gap-2">
              <span className="tabular">
                Seite {pageIndex + 1} von {table.getPageCount()}
              </span>
              <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Vorherige Seite">
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Nächste Seite">
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
