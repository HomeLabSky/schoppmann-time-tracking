'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useDeleteSpecialItem, useMySettings, useSaveSpecialItem } from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import type { SpecialItem } from '@/lib/timetracking'
import { formatCurrency, formatDate, toLocalDateString } from '@/lib/utils'
import { specialItemSchema, type SpecialItemInput } from '@/schemas'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Editable {
  /** Angezeigte Periode: Vorschlag für das Kaufdatum */
  periodStart: string
  periodEnd: string
}

/** Frühestes erlaubtes Kaufdatum: heute vor einem Monat (Backend-Regel wie bei Arbeitszeiten). */
function earliestDate(today = new Date()): string {
  const d = new Date(today)
  d.setMonth(d.getMonth() - 1)
  return toLocalDateString(d)
}

interface Props {
  items: SpecialItem[]
  total: number
  /** Nur der Mitarbeiter selbst in offenen Perioden: erfassen, ändern, löschen */
  editable?: Editable
}

/**
 * Sonderposten einer Periode: privat verauslagte Beträge, die mit dem Lohn ausgezahlt werden (zählen gegen die Grenze).
 * Ohne Sonderposten und ohne Bearbeitung erscheint nichts (wie auf dem Lohnzettel).
 */
export function SpecialItemsSection({ items, total, editable }: Props) {
  const [dialog, setDialog] = useState<SpecialItem | 'new' | null>(null)
  const remove = useDeleteSpecialItem()
  const [confirm, confirmDialog] = useConfirm()

  if (items.length === 0 && !editable) return null

  const askDelete = async (item: SpecialItem) => {
    if (!editable) return
    const ok = await confirm({
      title: `Sonderposten „${item.description}“ löschen?`,
      message: `${formatCurrency(item.amount)} vom ${formatDate(item.date)}. Der Vorgang wird protokolliert.`,
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (ok) remove.mutate(item.id)
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Sonderposten</CardTitle>
          <CardDescription>Privat verauslagte Beträge – werden mit dem Lohn ausgezahlt und zählen zur Minijob-Grenze.</CardDescription>
        </div>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setDialog('new')}>
            <Plus aria-hidden="true" /> Sonderposten erfassen
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Sonderposten in dieser Periode.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Datum</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="w-32 text-right">Betrag</TableHead>
                {editable && (
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="tabular">
                    {formatDate(item.date)}
                    {item.billingDate && (
                      <Badge
                        variant="info"
                        className="ml-2"
                        title={`Nachtrag: Der Kauf am ${formatDate(item.date)} lag in einer bereits abgeschlossenen Periode und wird in dieser Periode erstattet.`}
                      >
                        Nachtrag
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="tabular text-right">{formatCurrency(item.amount)}</TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Aktionen für ${item.description}`}>
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog(item)}>
                            <Pencil aria-hidden="true" /> Bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => askDelete(item)}>
                            <Trash2 aria-hidden="true" /> Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">
                  Summe
                </TableCell>
                <TableCell className="tabular text-right font-semibold">{formatCurrency(total)}</TableCell>
                {editable && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
      {editable && <SpecialItemDialog item={dialog} onClose={() => setDialog(null)} {...editable} />}
      {confirmDialog}
    </Card>
  )
}

/** Anlegen (item = 'new') oder Bearbeiten eines Sonderpostens. */
function SpecialItemDialog({ item, onClose, periodStart, periodEnd }: { item: SpecialItem | 'new' | null; onClose: () => void } & Editable) {
  const save = useSaveSpecialItem()
  const settings = useMySettings()
  const editing = item && item !== 'new' ? item : null
  const today = toLocalDateString()
  // Nacherfassung (vom Admin freigegeben): weiter als einen Monat zurück
  const regularMin = earliestDate()
  const backdateFrom = settings.data?.nacherfassungAb
  const minDate = backdateFrom && backdateFrom < regularMin ? backdateFrom : regularMin
  // Vorschlag: heute, sofern in der Periode – sonst ihr letzter Tag (falls erlaubt)
  const suggestedDate = today >= periodStart && today <= periodEnd ? today : periodEnd < today && periodEnd >= minDate ? periodEnd : today
  const form = useForm<SpecialItemInput>({
    resolver: zodResolver(specialItemSchema),
    defaultValues: { date: suggestedDate, description: '', amount: Number.NaN },
  })
  const { errors } = form.formState

  useEffect(() => {
    if (item === 'new') form.reset({ date: suggestedDate, description: '', amount: Number.NaN })
    else if (item) form.reset({ date: item.date, description: item.description, amount: item.amount })
    // suggestedDate nur beim Öffnen übernehmen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: editing?.id, data: values })
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, ['date', 'description', 'amount'])
    }
  })

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={editing ? 'Sonderposten bearbeiten' : 'Sonderposten erfassen'}
      description="Erscheint auf dem Lohnzettel und wird mit dem Lohn ausgezahlt. Zählt zur Minijob-Grenze; was darüber liegt, geht in den Übertrag."
      dismissible={!save.isPending}
    >
      <form onSubmit={onSubmit} noValidate>
        <ModalBody>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField
            id="si-date"
            label="Kaufdatum"
            hint={`${
              minDate < regularMin ? `Nacherfassung freigegeben: ab dem ${formatDate(minDate)}` : 'Höchstens einen Monat zurück'
            }, nicht in der Zukunft. Liegt es in einer abgeschlossenen Periode, wird der Betrag in der nächsten offenen ausgezahlt.`}
            error={errors.date?.message}
            required
          >
            {(c) => <Input {...c} type="date" min={minDate} max={today} className="max-w-48" {...form.register('date')} />}
          </FormField>
          <FormField id="si-description" label="Bezeichnung" error={errors.description?.message} required>
            {(c) => <Input {...c} maxLength={200} placeholder="z. B. Leuchtmittel Treppenhaus (Baumarkt)" {...form.register('description')} />}
          </FormField>
          <FormField id="si-amount" label="Betrag (€)" error={errors.amount?.message} required>
            {(c) => (
              <Input
                {...c}
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                placeholder="z. B. 23,90"
                className="max-w-40"
                {...form.register('amount', { valueAsNumber: true })}
              />
            )}
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!!editing && !form.formState.isDirty}>
            {editing ? 'Speichern' : 'Erfassen'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
