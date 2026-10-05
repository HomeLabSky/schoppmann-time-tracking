'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, ScrollText } from 'lucide-react'
import { useAuditLog, useUsers } from '@/lib/queries'
import { ACTION_FILTERS, ACTION_LABELS, FIELD_LABELS, changesOf, formatValue } from '@/lib/auditLabels'
import { formatDateTime, getErrorMessage } from '@/lib/utils'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25
const EMPTY_FILTERS = { userId: '', action: '', from: '', to: '' }

const actionTone = (action: string): 'neutral' | 'info' | 'warning' | 'danger' | 'success' => {
  if (action.endsWith('.delete') || action === 'auth.session_reuse_detected' || action === 'auth.login_failed') return 'danger'
  if (action === 'period.reopen' || action === 'user.deactivate') return 'warning'
  if (action === 'period.close') return 'success'
  if (action.startsWith('auth.')) return 'neutral'
  return 'info'
}

export default function AuditPage() {
  const users = useUsers()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const audit = useAuditLog({ ...filters, page, limit: PAGE_SIZE })

  const nameById = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data])
  const entries = audit.data?.entries ?? []
  const pagination = audit.data?.pagination
  const filtered = Object.values(filters).some(Boolean)

  const setFilter = (key: keyof typeof filters, value: string) => {
    setPage(1)
    setOpenId(null)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <>
      <PageHeader title="Änderungsprotokoll" description="Wer hat wann was geändert? Unveränderlich und ohne Passwörter." />

      <Card className="mb-4 grid gap-4 p-4 md:grid-cols-[1fr_1fr_auto_auto_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="au-user">Betroffener Benutzer</Label>
          <Select id="au-user" value={filters.userId} onChange={(e) => setFilter('userId', e.target.value)}>
            <option value="">Alle</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="au-action">Vorgang</Label>
          <Select id="au-action" value={filters.action} onChange={(e) => setFilter('action', e.target.value)}>
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="au-from">Von</Label>
          <Input id="au-from" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="au-to">Bis</Label>
          <Input id="au-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} />
        </div>
        <Button variant="ghost" disabled={!filtered} onClick={() => { setFilters(EMPTY_FILTERS); setPage(1) }}>
          <RotateCcw aria-hidden="true" /> Zurücksetzen
        </Button>
      </Card>

      {audit.isError && (
        <Alert variant="danger" title="Änderungsprotokoll konnte nicht geladen werden" className="mb-4">
          {getErrorMessage(audit.error)}
        </Alert>
      )}

      <div className={cn('overflow-hidden rounded-lg border bg-card transition-opacity', audit.isFetching && !audit.isLoading && 'opacity-70')}>
        <Table>
          <caption className="sr-only">Änderungsprotokoll</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-44">Zeitpunkt</TableHead>
              <TableHead>Vorgang</TableHead>
              <TableHead>Durchgeführt von</TableHead>
              <TableHead>Betrifft</TableHead>
              <TableHead className="w-28 text-right">
                <span className="sr-only">Details</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5" />
                  </TableCell>
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5}>
                  <EmptyState icon={ScrollText} title="Keine Einträge" description={filtered ? 'Für diese Auswahl gibt es keine Einträge.' : undefined} />
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => {
                const changes = changesOf(entry)
                const reason = typeof entry.meta?.reason === 'string' ? entry.meta.reason : null
                const hasDetails = changes.length > 0 || !!reason || !!entry.meta
                const open = openId === entry.id
                const detailsId = `audit-details-${entry.id}`
                return (
                  <Fragment key={entry.id}>
                    <TableRow>
                      <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={actionTone(entry.action)}>{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{entry.actorEmail}</TableCell>
                      <TableCell>{entry.targetUserId === null ? '–' : nameById.get(entry.targetUserId) ?? `Benutzer #${entry.targetUserId}`}</TableCell>
                      <TableCell className="text-right">
                        {hasDetails && (
                          <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : entry.id)} aria-expanded={open} aria-controls={detailsId}>
                            Details <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden="true" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow id={detailsId} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={5} className="py-4">
                          {reason && (
                            <p className="mb-3 text-sm">
                              <span className="font-medium">Begründung:</span> {reason}
                            </p>
                          )}
                          {changes.length > 0 && (
                            <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                              {changes.map((c) => (
                                <div key={c.key} className="flex flex-wrap gap-x-2">
                                  <dt className="text-muted-foreground">{FIELD_LABELS[c.key] ?? c.key}:</dt>
                                  <dd>
                                    {entry.before && entry.after ? (
                                      <>
                                        <span className="text-muted-foreground line-through">{formatValue(c.key, c.from)}</span>{' '}
                                        → <strong>{formatValue(c.key, c.to)}</strong>
                                      </>
                                    ) : (
                                      formatValue(c.key, c.to ?? c.from)
                                    )}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {entry.meta && !reason && (
                            <dl className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                              {Object.entries(entry.meta).map(([key, value]) => (
                                <div key={key} className="flex gap-2">
                                  <dt className="text-muted-foreground">{FIELD_LABELS[key] ?? key}:</dt>
                                  <dd>{formatValue(key, typeof value === 'object' ? JSON.stringify(value) : value)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular">{pagination.total} {pagination.total === 1 ? 'Eintrag' : 'Einträge'}</span>
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="tabular">
                Seite {pagination.page} von {pagination.totalPages}
              </span>
              <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Vorherige Seite">
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Nächste Seite"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
