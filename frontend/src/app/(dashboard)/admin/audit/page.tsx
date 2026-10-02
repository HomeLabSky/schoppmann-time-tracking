'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { adminApi } from '@/lib/api'
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils'
import { ACTION_LABELS } from '@/lib/auditLabels'
import type { User } from '@/types/api'
import type { AuditEntry, Pagination } from '@/types/audit'

const ACTION_FILTERS = [
  { value: '', label: 'Alle Vorgänge' },
  { value: 'time_entry', label: 'Zeiteinträge' },
  { value: 'period', label: 'Monatsabschluss' },
  { value: 'user', label: 'Benutzer' },
  { value: 'auth', label: 'Anmeldungen' },
  { value: 'minijob_setting', label: 'Minijob-Grenzen' },
]

const FIELD_LABELS: Record<string, string> = {
  date: 'Datum',
  startTime: 'Beginn',
  endTime: 'Ende',
  breakMinutes: 'Pause (Min.)',
  description: 'Beschreibung',
  hourlyRateCents: 'Stundensatz',
  email: 'E-Mail',
  name: 'Name',
  role: 'Rolle',
  isActive: 'Aktiv',
  stundenlohn: 'Stundenlohn',
  abrechnungStart: 'Abrechnung ab Tag',
  abrechnungEnde: 'Abrechnung bis Tag',
  lohnzettelEmail: 'Lohnzettel-E-Mail',
  monthlyLimit: 'Monatsgrenze',
  validFrom: 'Gültig ab',
  validUntil: 'Gültig bis',
  periodStart: 'Periode von',
  periodEnd: 'Periode bis',
  entryCount: 'Einträge',
  totalMinutes: 'Minuten',
  earnings: 'Verdienst',
  limit: 'Grenze',
  carryIn: 'Übertrag Vorperiode',
  paid: 'Auszahlung',
  carryOut: 'Übertrag',
  reason: 'Grund',
  ip: 'IP-Adresse',
}

const MONEY_FIELDS = new Set(['earnings', 'limit', 'carryIn', 'paid', 'carryOut', 'stundenlohn', 'monthlyLimit'])

const formatValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '–'
  if (key === 'hourlyRateCents') return `${formatCurrency(Number(value) / 100)}/Std.`
  if (MONEY_FIELDS.has(key)) return formatCurrency(Number(value))
  if (typeof value === 'boolean') return value ? 'ja' : 'nein'
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return formatDate(String(value))
  return String(value)
}

interface Change { key: string; from?: unknown; to?: unknown }

/** Nur geänderte Felder (Update), bzw. alle Felder bei Anlegen/Löschen. */
const changesOf = (entry: AuditEntry): Change[] => {
  const before = entry.before ?? {}
  const after = entry.after ?? {}
  if (entry.before && entry.after) {
    return Object.keys({ ...before, ...after })
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => ({ key, from: before[key], to: after[key] }))
  }
  const single = (entry.after ?? entry.before ?? {}) as Record<string, unknown>
  return Object.keys(single).map((key) => ({ key, to: entry.after ? single[key] : undefined, from: entry.after ? undefined : single[key] }))
}

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'medium' })

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [filters, setFilters] = useState({ userId: '', action: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi.getUsers({ limit: 200 }).then((res) => setUsers(res.data.users)).catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.getAuditLog({ ...filters, page, limit: 25 })
      setEntries(res.data.entries)
      setPagination(res.data.pagination)
    } catch (err) {
      setError(getErrorMessage(err, 'Änderungsprotokoll konnte nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    load()
  }, [load])

  const setFilter = (key: keyof typeof filters, value: string) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const userName = (id: number | null) => {
    if (id === null) return '–'
    const u = users.find((x) => x.id === id)
    return u ? u.name : `Benutzer #${id}`
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Änderungsprotokoll</h2>
        <p className="mt-1 text-gray-600">
          Wer hat wann was geändert? Das Protokoll ist unveränderlich und enthält keine Passwörter.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <div>
          <label htmlFor="au-user" className="mb-1 block text-sm font-medium text-gray-700">Betroffener Benutzer</label>
          <select id="au-user" value={filters.userId} onChange={(e) => setFilter('userId', e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">Alle</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="au-action" className="mb-1 block text-sm font-medium text-gray-700">Vorgang</label>
          <select id="au-action" value={filters.action} onChange={(e) => setFilter('action', e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
            {ACTION_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="au-from" className="mb-1 block text-sm font-medium text-gray-700">Von</label>
          <input id="au-from" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="au-to" className="mb-1 block text-sm font-medium text-gray-700">Bis</label>
          <input id="au-to" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <caption className="sr-only">Änderungsprotokoll</caption>
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-3">Zeitpunkt</th>
              <th scope="col" className="px-4 py-3">Vorgang</th>
              <th scope="col" className="px-4 py-3">Durchgeführt von</th>
              <th scope="col" className="px-4 py-3">Betrifft</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Wird geladen…</td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Keine Einträge für diese Auswahl.</td></tr>
            )}
            {entries.map((entry) => {
              const changes = changesOf(entry)
              const reason = typeof entry.meta?.reason === 'string' ? entry.meta.reason : null
              const hasDetails = changes.length > 0 || reason || entry.meta
              const open = openId === entry.id
              return (
                <Fragment key={entry.id}>
                  <tr className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                    <td className="px-4 py-3">{entry.actorEmail}</td>
                    <td className="px-4 py-3">{userName(entry.targetUserId)}</td>
                    <td className="px-4 py-3 text-right">
                      {hasDetails && (
                        <button
                          onClick={() => setOpenId(open ? null : entry.id)}
                          aria-expanded={open}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {open ? 'Ausblenden' : 'Details'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        {reason && <p className="mb-2 text-sm"><span className="font-medium">Begründung:</span> {reason}</p>}
                        {changes.length > 0 && (
                          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                            {changes.map((c) => (
                              <div key={c.key} className="flex gap-2">
                                <dt className="font-medium text-gray-700">{FIELD_LABELS[c.key] ?? c.key}:</dt>
                                <dd className="text-gray-700">
                                  {entry.before && entry.after
                                    ? <>{formatValue(c.key, c.from)} → <strong>{formatValue(c.key, c.to)}</strong></>
                                    : formatValue(c.key, c.to ?? c.from)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {entry.meta && !reason && (
                          <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-500">{JSON.stringify(entry.meta, null, 2)}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>{pagination.total} Einträge · Seite {pagination.page} von {pagination.totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Zurück</button>
            <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40">Weiter</button>
          </div>
        </div>
      )}
    </div>
  )
}
