'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '@/lib/api'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate, formatHours, getErrorMessage, toLocalDateString } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import type { User } from '@/types/api'
import type { Timesheet, TimesheetPeriod } from '@/types/audit'

type Dialog = null | 'close' | 'reopen'

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

export default function TimesheetsPage() {
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState<number | null>(null)
  const [periods, setPeriods] = useState<TimesheetPeriod[]>([])
  const [month, setMonth] = useState('')
  const [sheet, setSheet] = useState<Timesheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')

  // Mitarbeiter laden
  useEffect(() => {
    adminApi
      .getUsers({ limit: 200 })
      .then((res) => {
        const list = res.data.users
        setUsers(list)
        const first = list.find((u) => u.role === 'mitarbeiter') ?? list[0]
        if (first) setUserId(first.id)
      })
      .catch((err) => setError(getErrorMessage(err, 'Benutzer konnten nicht geladen werden')))
      .finally(() => setLoading(false))
  }, [])

  // Perioden des gewählten Mitarbeiters
  const loadPeriods = useCallback(async (id: number, keepMonth?: string) => {
    try {
      const res = await adminApi.getTimesheetPeriods(id)
      const list = res.data.periods
      setPeriods(list)
      const wanted = keepMonth && list.some((p) => p.value === keepMonth) ? keepMonth : undefined
      // Standard: die zuletzt beendete Periode (die wird typischerweise abgerechnet)
      const today = toLocalDateString()
      const lastEnded = [...list].reverse().find((p) => p.endDate < today)
      setMonth(wanted ?? lastEnded?.value ?? res.data.currentPeriod?.value ?? list[0]?.value ?? '')
    } catch (err) {
      setError(getErrorMessage(err, 'Perioden konnten nicht geladen werden'))
    }
  }, [])

  useEffect(() => {
    if (userId) {
      setSheet(null)
      loadPeriods(userId)
    }
  }, [userId, loadPeriods])

  // Zeitnachweis der gewählten Periode
  const loadSheet = useCallback(async (id: number, m: string) => {
    try {
      setError('')
      const res = await adminApi.getTimesheet(id, m)
      setSheet(res.data)
    } catch (err) {
      setSheet(null)
      setError(getErrorMessage(err, 'Zeitnachweis konnte nicht geladen werden'))
    }
  }, [])

  useEffect(() => {
    if (userId && month) loadSheet(userId, month)
  }, [userId, month, loadSheet])

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    if (!userId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
      setDialog(null)
      setReason('')
      await loadPeriods(userId, month)
      await loadSheet(userId, month)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const selectedUser = users.find((u) => u.id === userId)
  const closed = sheet?.period?.status === 'closed'
  const periodEnded = sheet ? sheet.period.endDate < toLocalDateString() : false
  const summary = sheet?.summary
  const limitMissing = !closed && !!summary?.minijobLimitMissing

  if (loading) {
    return <p className="text-center py-12 text-gray-600">Zeitnachweise werden geladen…</p>
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Zeitnachweise &amp; Monatsabschluss</h2>
        <p className="text-gray-600 mt-1">
          Zeiten prüfen und Abrechnungsperioden abschließen. Abgeschlossene Perioden sind für Mitarbeiter gesperrt.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{notice}</div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <div>
          <label htmlFor="ts-user" className="mb-1 block text-sm font-medium text-gray-700">Mitarbeiter</label>
          <select
            id="ts-user"
            value={userId ?? ''}
            onChange={(e) => { setNotice(''); setUserId(Number(e.target.value)) }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}){u.isActive ? '' : ' – deaktiviert'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ts-period" className="mb-1 block text-sm font-medium text-gray-700">Abrechnungsperiode</label>
          <select
            id="ts-period"
            value={month}
            onChange={(e) => { setNotice(''); setMonth(e.target.value) }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.isClosed ? ' – abgeschlossen' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sheet && summary && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  closed ? 'bg-slate-800 text-white' : limitMissing ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'
                }`}
              >
                {closed
                  ? 'Abgeschlossen'
                  : limitMissing
                    ? 'Offen – Minijob-Grenze fehlt'
                    : periodEnded ? 'Offen – bereit zum Abschluss' : 'Offen – Periode läuft noch'}
              </span>
              {closed && sheet.closure && (
                <span className="text-sm text-gray-600">am {formatDateTime(sheet.closure.closedAt)}</span>
              )}
            </div>
            <div>
              {closed ? (
                <button
                  onClick={() => setDialog('reopen')}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Wieder öffnen…
                </button>
              ) : (
                <button
                  onClick={() => setDialog('close')}
                  disabled={!periodEnded || limitMissing}
                  title={
                    limitMissing
                      ? 'Abschluss erst möglich, wenn eine Minijob-Grenze für diesen Zeitraum hinterlegt ist'
                      : periodEnded ? undefined : `Abschluss erst nach Periodenende (${formatDate(sheet.period.endDate)}) möglich`
                  }
                  className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Periode abschließen…
                </button>
              )}
            </div>
          </div>

          {limitMissing && (
            <div role="alert" className="mb-4 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">Keine Minijob-Grenze hinterlegt – Beträge sind vorläufig.</p>
                <p className="mt-1">
                  Für diese Periode (oder eine frühere offene Periode im Übertrag) gibt es keine gültige Grenze. Auszahlung
                  und Übertrag sind deshalb nur geschätzt, der Abschluss ist gesperrt.{' '}
                  <Link href="/admin/minijob" className="font-medium underline">Grenze anlegen</Link>
                </p>
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Arbeitszeit', value: `${formatHours(summary.totalHours)}` },
              { label: 'Verdienst', value: formatCurrency(summary.totalEarnings) },
              {
                label: limitMissing ? 'Auszahlung (vorläufig, keine Grenze)' : `Auszahlung (Grenze ${formatCurrency(summary.minijobLimit)})`,
                value: formatCurrency(summary.paidThisMonth),
                warn: limitMissing,
              },
              { label: 'Übertrag in nächste Periode', value: formatCurrency(summary.carryOut), warn: summary.carryOut > 0 },
            ].map((card) => (
              <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-sm text-gray-600">{card.label}</div>
                <div className={`mt-1 text-xl font-semibold ${card.warn ? 'text-orange-600' : 'text-gray-900'}`}>{card.value}</div>
              </div>
            ))}
          </div>
          {summary.carryIn > 0 && (
            <p className="mb-4 text-sm text-gray-600">Übertrag aus der Vorperiode: {formatCurrency(summary.carryIn)}</p>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <caption className="sr-only">
                Zeiteinträge von {selectedUser?.name} für {sheet.period.monthName} {sheet.period.year}
              </caption>
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Datum</th>
                  <th scope="col" className="px-4 py-3">Zeit</th>
                  <th scope="col" className="px-4 py-3">Pause</th>
                  <th scope="col" className="px-4 py-3">Arbeitszeit</th>
                  <th scope="col" className="px-4 py-3">Satz</th>
                  <th scope="col" className="px-4 py-3">Verdienst</th>
                  <th scope="col" className="px-4 py-3">Beschreibung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sheet.records.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Keine Einträge in dieser Periode.</td></tr>
                )}
                {sheet.records.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(r.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.startTime} – {r.endTime}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.breakMinutes} Min.</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.workTime}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatCurrency(r.hourlyRate ?? 0)}/Std.</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.formattedEarnings}</td>
                    <td className="px-4 py-3 text-gray-600">{r.description || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {dialog && sheet && summary && (
        <Modal
          open
          onClose={() => { setDialog(null); setReason('') }}
          title={dialog === 'close' ? 'Periode abschließen?' : 'Periode wieder öffnen'}
          dismissible={!busy}
        >
          <div className="px-6 py-4">
            {dialog === 'close' ? (
              <>
                <p className="text-sm text-gray-600">
                  {selectedUser?.name}: {formatDate(sheet.period.startDate)} – {formatDate(sheet.period.endDate)}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-gray-700">
                  <li>{sheet.records.length} Einträge, {formatHours(summary.totalHours)}</li>
                  <li>Verdienst {formatCurrency(summary.totalEarnings)}, Auszahlung {formatCurrency(summary.paidThisMonth)}</li>
                  <li>Übertrag {formatCurrency(summary.carryOut)}</li>
                </ul>
                <p className="mt-3 text-sm text-gray-600">
                  Danach kann der Mitarbeiter in dieser Periode nichts mehr anlegen, ändern oder löschen. Die Beträge werden
                  festgeschrieben. Der Vorgang wird protokolliert.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => setDialog(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Abbrechen</button>
                  <button
                    disabled={busy}
                    onClick={() => run(() => adminApi.closePeriod(userId!, month), 'Periode wurde abgeschlossen.')}
                    className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    {busy ? 'Wird abgeschlossen…' : 'Abschließen'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Der Mitarbeiter kann danach Einträge dieser Periode wieder ändern. Bitte eine Begründung angeben – sie wird im
                  Änderungsprotokoll festgehalten.
                </p>
                <label htmlFor="ts-reason" className="mt-4 block text-sm font-medium text-gray-700">Begründung</label>
                <textarea
                  id="ts-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="z. B. Endzeit am 03.06. falsch erfasst"
                />
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => { setDialog(null); setReason('') }} className="rounded-md border border-gray-300 px-4 py-2 text-sm">Abbrechen</button>
                  <button
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => run(() => adminApi.reopenPeriod(userId!, month, reason.trim()), 'Periode wurde wieder geöffnet.')}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? 'Wird geöffnet…' : 'Wieder öffnen'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
