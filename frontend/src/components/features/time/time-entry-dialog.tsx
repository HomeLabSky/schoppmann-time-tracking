'use client'

import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Moon } from 'lucide-react'
import { useSaveTimeEntry } from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import type { TimeRecord } from '@/lib/timetracking'
import { formatHours, toLocalDateString } from '@/lib/utils'
import { spanMinutes, timeEntrySchema, type TimeEntryInput } from '@/schemas'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal'

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/

/** Frühestes erlaubtes Datum für neue Einträge: heute vor einem Monat (Backend-Regel). */
function earliestDate(today = new Date()): string {
  const d = new Date(today)
  d.setMonth(d.getMonth() - 1)
  return toLocalDateString(d)
}

interface Props {
  /** 'new' = anlegen, Eintrag = bearbeiten, null = geschlossen */
  entry: TimeRecord | 'new' | null
  onClose: () => void
  /** Vorschlag für neue Einträge (z. B. Zeiten des letzten Eintrags) */
  defaults?: Partial<TimeEntryInput>
}

export function TimeEntryDialog({ entry, onClose, defaults }: Props) {
  const save = useSaveTimeEntry()
  const editing = entry && entry !== 'new' ? entry : null
  const form = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: { date: toLocalDateString(), startTime: '09:00', endTime: '13:00', breakMinutes: 0, description: '' },
  })
  const { errors } = form.formState
  const [startTime, endTime, breakMinutes] = useWatch({ control: form.control, name: ['startTime', 'endTime', 'breakMinutes'] })

  useEffect(() => {
    if (entry === 'new') {
      form.reset({ date: toLocalDateString(), startTime: '09:00', endTime: '13:00', breakMinutes: 0, description: '', ...defaults })
    } else if (entry) {
      form.reset({
        date: entry.date,
        startTime: entry.startTime,
        endTime: entry.endTime,
        breakMinutes: entry.breakMinutes,
        description: entry.description ?? '',
      })
    }
    // defaults nur beim Öffnen übernehmen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, form])

  const valid = TIME_PATTERN.test(startTime ?? '') && TIME_PATTERN.test(endTime ?? '') && startTime !== endTime
  const span = valid ? spanMinutes(startTime, endTime) : 0
  const work = Math.max(0, span - (Number.isFinite(breakMinutes) ? breakMinutes : 0))
  const overnight = valid && endTime < startTime

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: editing?.id, data: { ...values, description: values.description || undefined } })
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, ['date', 'startTime', 'endTime', 'breakMinutes', 'description'])
    }
  })

  return (
    <Modal open={entry !== null} onClose={onClose} title={editing ? 'Eintrag bearbeiten' : 'Arbeitszeit erfassen'} dismissible={!save.isPending}>
      <form onSubmit={onSubmit} noValidate>
        <ModalBody>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField
            id="te-date"
            label="Datum"
            hint={editing ? 'Das Datum eines Eintrags kann nicht geändert werden.' : 'Höchstens einen Monat zurück, nicht in der Zukunft.'}
            error={errors.date?.message}
            required
          >
            {(c) => (
              <Input
                {...c}
                type="date"
                readOnly={!!editing}
                min={editing ? undefined : earliestDate()}
                max={editing ? undefined : toLocalDateString()}
                className="max-w-48 read-only:bg-muted read-only:text-muted-foreground"
                {...form.register('date')}
              />
            )}
          </FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField id="te-start" label="Beginn" error={errors.startTime?.message} required>
              {(c) => <Input {...c} type="time" {...form.register('startTime')} />}
            </FormField>
            <FormField id="te-end" label="Ende" error={errors.endTime?.message} required>
              {(c) => <Input {...c} type="time" {...form.register('endTime')} />}
            </FormField>
            <FormField id="te-break" label="Pause (Min.)" error={errors.breakMinutes?.message}>
              {(c) => <Input {...c} type="number" min="0" max="480" step="5" {...form.register('breakMinutes', { valueAsNumber: true })} />}
            </FormField>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm" aria-live="polite">
            <span className="text-muted-foreground">Arbeitszeit</span>
            <span className="tabular flex items-center gap-2 font-medium">
              {overnight && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" /> endet am Folgetag
                </span>
              )}
              {valid ? formatHours(work / 60) : '–'}
            </span>
          </div>
          <FormField id="te-description" label="Tätigkeit" hint="Optional, z. B. Objekt oder Aufgabe." error={errors.description?.message}>
            {(c) => <Textarea {...c} rows={2} maxLength={500} {...form.register('description')} />}
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" loading={save.isPending}>
            {editing ? 'Speichern' : 'Erfassen'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
