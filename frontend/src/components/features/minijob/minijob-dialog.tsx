'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSaveMinijobSetting } from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import { minijobSettingSchema, type MinijobSettingInput } from '@/schemas'
import type { MinijobSetting } from '@/types/api'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal'

const EMPTY: MinijobSettingInput = { monthlyLimit: Number.NaN, description: '', validFrom: '', validUntil: '' }

/** Anlegen (setting = 'new') oder Bearbeiten einer Minijob-Grenze. */
export function MinijobDialog({ setting, onClose }: { setting: MinijobSetting | 'new' | null; onClose: () => void }) {
  const save = useSaveMinijobSetting()
  const editing = setting && setting !== 'new' ? setting : null
  const form = useForm<MinijobSettingInput>({ resolver: zodResolver(minijobSettingSchema), defaultValues: EMPTY })
  const { errors } = form.formState

  useEffect(() => {
    if (setting === 'new') form.reset(EMPTY)
    else if (setting)
      form.reset({
        monthlyLimit: Number(setting.monthlyLimit),
        description: setting.description,
        validFrom: setting.validFrom,
        validUntil: setting.validUntil ?? '',
      })
  }, [setting, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: editing?.id, data: { ...values, validUntil: values.validUntil || null } })
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, ['monthlyLimit', 'description', 'validFrom', 'validUntil'])
    }
  })

  return (
    <Modal
      open={setting !== null}
      onClose={onClose}
      title={editing ? 'Grenze bearbeiten' : 'Neue Minijob-Grenze'}
      description="Gilt für Perioden, deren Ende im Gültigkeitszeitraum liegt. Abgeschlossene Perioden behalten ihre Grenze."
      dismissible={!save.isPending}
    >
      <form onSubmit={onSubmit} noValidate>
        <ModalBody>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField id="mj-limit" label="Monatliche Grenze (€)" error={errors.monthlyLimit?.message} required>
            {(c) => (
              <Input {...c} type="number" step="0.01" min="0" inputMode="decimal" placeholder="z. B. 603,00" className="max-w-40" {...form.register('monthlyLimit', { valueAsNumber: true })} />
            )}
          </FormField>
          <FormField id="mj-description" label="Beschreibung" error={errors.description?.message} required>
            {(c) => <Input {...c} placeholder="z. B. Gesetzliche Minijob-Grenze 2026" {...form.register('description')} />}
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="mj-from" label="Gültig ab" hint="Auch rückwirkend möglich." error={errors.validFrom?.message} required>
              {(c) => <Input {...c} type="date" {...form.register('validFrom')} />}
            </FormField>
            <FormField id="mj-until" label="Gültig bis" hint="Leer = unbegrenzt" error={errors.validUntil?.message}>
              {(c) => <Input {...c} type="date" {...form.register('validUntil')} />}
            </FormField>
          </div>
          {!editing && (
            <p className="text-xs text-muted-foreground">
              Eine unbegrenzte vorherige Grenze wird automatisch zum Vortag des neuen Startdatums beendet.
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!!editing && !form.formState.isDirty}>
            {editing ? 'Speichern' : 'Anlegen'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
