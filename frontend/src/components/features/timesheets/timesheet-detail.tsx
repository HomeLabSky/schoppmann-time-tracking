'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, Lock, LockOpen } from 'lucide-react'
import { useClosePeriod, useReopenPeriod, useTimesheet, useUsers } from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import { csvNumber } from '@/lib/csv'
import { formatCurrency, formatDate, formatDateTime, formatHours, getErrorMessage, toLocalDateString } from '@/lib/utils'
import type { TimeRecord } from '@/lib/timetracking'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { FormField } from '@/components/ui/form-field'
import { Select, Textarea } from '@/components/ui/input'
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { PeriodStatusBadge } from '../period-status'

const reopenSchema = z.object({ reason: z.string().trim().min(5, 'Bitte mindestens 5 Zeichen').max(500, 'Höchstens 500 Zeichen') })

interface Props {
  userId: number
  month: string
  onBack: () => void
  onSelectUser: (userId: number) => void
}

export function TimesheetDetail({ userId, month, onBack, onSelectUser }: Props) {
  const users = useUsers()
  const sheet = useTimesheet(userId, month)
  const [dialog, setDialog] = useState<null | 'close' | 'reopen'>(null)

  const employees = useMemo(() => (users.data ?? []).filter((u) => u.role === 'mitarbeiter').sort((a, b) => a.name.localeCompare(b.name, 'de')), [users.data])
  const employee = employees.find((u) => u.id === userId)

  const data = sheet.data
  const summary = data?.summary
  const closed = data?.period.status === 'closed'
  const ended = data ? data.period.endDate < toLocalDateString() : false
  const limitMissing = !closed && !!summary?.minijobLimitMissing
  const status = closed ? 'closed' : ended ? 'ready' : 'open'

  const columns = useMemo<ColumnDef<TimeRecord, unknown>[]>(
    () => [
      { id: 'date', accessorFn: (r) => r.date, header: 'Datum', cell: ({ row }) => <span className="tabular">{formatDate(row.original.date)}</span> },
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
      { id: 'break', accessorFn: (r) => r.breakMinutes, header: 'Pause', meta: { className: 'text-right tabular' }, cell: ({ row }) => `${row.original.breakMinutes} Min.` },
      { id: 'work', accessorFn: (r) => r.workMinutes, header: 'Arbeitszeit', meta: { className: 'text-right tabular' }, cell: ({ row }) => formatHours(row.original.totalHours) },
      { id: 'rate', accessorFn: (r) => r.hourlyRate ?? 0, header: 'Satz', meta: { className: 'text-right tabular' }, cell: ({ row }) => formatCurrency(row.original.hourlyRate ?? 0) },
      { id: 'earnings', accessorFn: (r) => r.earnings, header: 'Verdienst', meta: { className: 'text-right tabular' }, cell: ({ row }) => formatCurrency(row.original.earnings) },
      { id: 'description', accessorFn: (r) => r.description ?? '', header: 'Beschreibung', enableSorting: false, cell: ({ row }) => <span className="text-muted-foreground">{row.original.description || '–'}</span> },
    ],
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft aria-hidden="true" /> Übersicht
          </Button>
          <label htmlFor="ts-employee" className="sr-only">
            Mitarbeiter
          </label>
          <Select id="ts-employee" value={userId} onChange={(e) => onSelectUser(Number(e.target.value))} className="w-64">
            {employees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.isActive ? '' : ' (deaktiviert)'}
              </option>
            ))}
          </Select>
          {data && <PeriodStatusBadge status={status} limitMissing={limitMissing} />}
          {data && (
            <span className="tabular text-sm text-muted-foreground">
              {formatDate(data.period.startDate)} – {formatDate(data.period.endDate)}
            </span>
          )}
        </div>
        {data &&
          (closed ? (
            <Button variant="outline" onClick={() => setDialog('reopen')}>
              <LockOpen aria-hidden="true" /> Wieder öffnen…
            </Button>
          ) : (
            <Button
              onClick={() => setDialog('close')}
              disabled={!ended || limitMissing}
              title={limitMissing ? 'Erst eine Minijob-Grenze hinterlegen' : !ended ? `Abschluss erst nach dem ${formatDate(data.period.endDate)}` : undefined}
            >
              <Lock aria-hidden="true" /> Periode abschließen…
            </Button>
          ))}
      </div>

      {sheet.isError && (
        <Alert variant="danger" title="Zeitnachweis konnte nicht geladen werden">
          {getErrorMessage(sheet.error)}
        </Alert>
      )}

      {closed && data?.closure && (
        <Alert variant="info" title={`Abgeschlossen am ${formatDateTime(data.closure.closedAt)}`}>
          Die Beträge sind festgeschrieben; der Mitarbeiter kann in dieser Periode nichts mehr ändern.
        </Alert>
      )}
      {limitMissing && (
        <Alert
          variant="warning"
          title="Keine Minijob-Grenze hinterlegt – Beträge sind vorläufig"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/minijob">Grenze anlegen</Link>
            </Button>
          }
        >
          Für diese Periode (oder eine frühere offene Periode im Übertrag) gibt es keine gültige Grenze. Der Abschluss ist gesperrt.
        </Alert>
      )}
      {!closed && !ended && data && (
        <Alert variant="info" title="Periode läuft noch">
          Abschließen ist ab dem {formatDate(data.period.endDate)} (Periodenende) möglich.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Arbeitszeit" value={summary ? formatHours(summary.totalHours) : ''} loading={sheet.isLoading} hint={summary ? `${summary.entryCount} ${summary.entryCount === 1 ? 'Eintrag' : 'Einträge'}` : undefined} />
        <StatCard label="Verdienst" value={summary ? formatCurrency(summary.totalEarnings) : ''} loading={sheet.isLoading} hint={summary && summary.carryIn > 0 ? `+ ${formatCurrency(summary.carryIn)} Übertrag` : undefined} />
        <StatCard
          label="Auszahlung"
          value={summary ? formatCurrency(summary.paidThisMonth) : ''}
          tone={limitMissing ? 'warning' : 'default'}
          loading={sheet.isLoading}
          hint={summary ? (limitMissing ? 'vorläufig, keine Grenze' : `Grenze ${formatCurrency(summary.minijobLimit)}`) : undefined}
        />
        <StatCard
          label="Übertrag in nächste Periode"
          value={summary ? formatCurrency(summary.carryOut) : ''}
          tone={summary && summary.carryOut > 0 ? 'warning' : 'default'}
          loading={sheet.isLoading}
        />
      </div>

      {sheet.isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <DataTable
          caption={`Zeiteinträge von ${employee?.name ?? 'Mitarbeiter'}`}
          columns={columns}
          data={data?.records ?? []}
          getRowId={(r) => String(r.id)}
          initialSorting={[{ id: 'date', desc: false }]}
          pageSize={100}
          empty={{ title: 'Keine Einträge in dieser Periode' }}
          csv={{
            filename: `zeitnachweis-${(employee?.name ?? String(userId)).toLowerCase().replace(/\s+/g, '-')}-${month}`,
            columns: [
              { header: 'Datum', value: (r) => formatDate(r.date) },
              { header: 'Beginn', value: (r) => r.startTime },
              { header: 'Ende', value: (r) => r.endTime },
              { header: 'Pause (Min.)', value: (r) => r.breakMinutes },
              { header: 'Arbeitszeit (Std.)', value: (r) => csvNumber(r.totalHours) },
              { header: 'Satz (€)', value: (r) => csvNumber(r.hourlyRate ?? 0) },
              { header: 'Verdienst (€)', value: (r) => csvNumber(r.earnings) },
              { header: 'Beschreibung', value: (r) => r.description ?? '' },
            ],
          }}
        />
      )}

      {data && summary && (
        <>
          <CloseDialog
            open={dialog === 'close'}
            onClose={() => setDialog(null)}
            userId={userId}
            month={month}
            name={employee?.name ?? ''}
            details={[
              `${formatDate(data.period.startDate)} – ${formatDate(data.period.endDate)}`,
              `${summary.entryCount} Einträge, ${formatHours(summary.totalHours)}`,
              `Verdienst ${formatCurrency(summary.totalEarnings)} · Auszahlung ${formatCurrency(summary.paidThisMonth)} · Übertrag ${formatCurrency(summary.carryOut)}`,
            ]}
          />
          <ReopenDialog open={dialog === 'reopen'} onClose={() => setDialog(null)} userId={userId} month={month} name={employee?.name ?? ''} />
        </>
      )}
    </div>
  )
}

function CloseDialog({ open, onClose, userId, month, name, details }: { open: boolean; onClose: () => void; userId: number; month: string; name: string; details: string[] }) {
  const close = useClosePeriod()
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await close.mutateAsync({ userId, month })
      onClose()
    } catch (e) {
      setError(getErrorMessage(e, 'Abschluss fehlgeschlagen'))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Periode abschließen?" description={name} dismissible={!close.isPending}>
      <ModalBody>
        {error && <Alert variant="danger" title={error} />}
        <ul className="tabular space-y-1 text-sm">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Danach kann der Mitarbeiter in dieser Periode nichts mehr anlegen, ändern oder löschen. Die Beträge werden festgeschrieben, der
          Vorgang wird protokolliert.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={close.isPending} data-autofocus>
          Abbrechen
        </Button>
        <Button onClick={submit} loading={close.isPending}>
          <Lock aria-hidden="true" /> Abschließen
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function ReopenDialog({ open, onClose, userId, month, name }: { open: boolean; onClose: () => void; userId: number; month: string; name: string }) {
  const reopen = useReopenPeriod()
  const form = useForm<z.infer<typeof reopenSchema>>({ resolver: zodResolver(reopenSchema), defaultValues: { reason: '' } })
  const { errors } = form.formState

  const handleClose = () => {
    form.reset()
    onClose()
  }

  const onSubmit = form.handleSubmit(async ({ reason }) => {
    try {
      await reopen.mutateAsync({ userId, month, reason })
      handleClose()
    } catch (error) {
      applyServerErrors(error, form.setError, ['reason'], 'Wiedereröffnen fehlgeschlagen')
    }
  })

  return (
    <Modal open={open} onClose={handleClose} title="Periode wieder öffnen" description={name} dismissible={!reopen.isPending}>
      <form onSubmit={onSubmit} noValidate>
        <ModalBody>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <p className="text-sm text-muted-foreground">
            Der Mitarbeiter kann danach Einträge dieser Periode wieder ändern. Die Begründung wird im Änderungsprotokoll festgehalten.
          </p>
          <FormField id="reopen-reason" label="Begründung" error={errors.reason?.message} required>
            {(c) => <Textarea {...c} rows={3} placeholder="z. B. Endzeit am 03.06. falsch erfasst" {...form.register('reason')} />}
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={handleClose} disabled={reopen.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" variant="destructive" loading={reopen.isPending}>
            Wieder öffnen
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
