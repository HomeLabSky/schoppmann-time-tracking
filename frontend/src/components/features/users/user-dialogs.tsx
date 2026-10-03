'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateUser, useUpdateUser, useUpdateUserSettings } from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import {
  ROLE_LABELS,
  userCreateSchema,
  userEditSchema,
  userSettingsSchema,
  type UserCreateInput,
  type UserEditInput,
  type UserSettingsInput,
} from '@/schemas'
import type { User } from '@/types/api'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, Select } from '@/components/ui/input'
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal'

const roleOptions = (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((value) => (
  <option key={value} value={value}>
    {ROLE_LABELS[value]}
  </option>
))

export function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser()
  const form = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: '', email: '', password: '', role: 'mitarbeiter' },
  })
  const { errors } = form.formState

  useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values)
      onClose()
    } catch (error) {
      if ((error as { code?: string })?.code === 'EMAIL_EXISTS') {
        form.setError('email', { message: 'Diese E-Mail-Adresse ist bereits registriert' })
        return
      }
      applyServerErrors(error, form.setError, ['name', 'email', 'password', 'role'], 'Benutzer konnte nicht angelegt werden')
    }
  })

  return (
    <Modal open={open} onClose={onClose} title="Neuen Benutzer anlegen" description="Stundenlohn und Abrechnungszeitraum legen Sie danach fest." dismissible={!create.isPending}>
      <form onSubmit={onSubmit} noValidate>
        <ModalBody>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField id="cu-name" label="Vollständiger Name" error={errors.name?.message} required>
            {(c) => <Input {...c} autoComplete="off" placeholder="z. B. Max Mustermann" {...form.register('name')} />}
          </FormField>
          <FormField id="cu-email" label="E-Mail-Adresse" error={errors.email?.message} required>
            {(c) => <Input {...c} type="email" autoComplete="off" placeholder="name@schoppmann.de" {...form.register('email')} />}
          </FormField>
          <FormField
            id="cu-password"
            label="Startpasswort"
            hint="Mindestens 8 Zeichen, Groß- und Kleinbuchstaben und eine Zahl. Bitte persönlich übergeben."
            error={errors.password?.message}
            required
          >
            {(c) => <Input {...c} type="password" autoComplete="new-password" {...form.register('password')} />}
          </FormField>
          <FormField id="cu-role" label="Rolle" error={errors.role?.message}>
            {(c) => (
              <Select {...c} {...form.register('role')}>
                {roleOptions}
              </Select>
            )}
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" loading={create.isPending}>
            Anlegen
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export function EditUserDialog({ user, onClose, isSelf }: { user: User | null; onClose: () => void; isSelf: boolean }) {
  const update = useUpdateUser()
  const form = useForm<UserEditInput>({
    resolver: zodResolver(userEditSchema),
    defaultValues: { name: '', email: '', role: 'mitarbeiter', password: '' },
  })
  const { errors } = form.formState

  useEffect(() => {
    if (user) form.reset({ name: user.name, email: user.email, role: user.role, password: '' })
  }, [user, form])

  const onSubmit = form.handleSubmit(async ({ password, ...rest }) => {
    if (!user) return
    try {
      await update.mutateAsync({ id: user.id, data: password ? { ...rest, password } : rest })
      onClose()
    } catch (error) {
      if ((error as { code?: string })?.code === 'EMAIL_EXISTS') {
        form.setError('email', { message: 'Diese E-Mail-Adresse ist bereits vergeben' })
        return
      }
      applyServerErrors(error, form.setError, ['name', 'email', 'role', 'password'])
    }
  })

  return (
    <Modal open={user !== null} onClose={onClose} title="Benutzer bearbeiten" description={user?.email} dismissible={!update.isPending}>
      <form onSubmit={onSubmit} noValidate>
        <ModalBody>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField id="eu-name" label="Name" error={errors.name?.message} required>
            {(c) => <Input {...c} {...form.register('name')} />}
          </FormField>
          <FormField id="eu-email" label="E-Mail-Adresse (Anmeldung)" error={errors.email?.message} required>
            {(c) => <Input {...c} type="email" {...form.register('email')} />}
          </FormField>
          {isSelf ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Rolle</p>
              <p className="text-sm">{user ? ROLE_LABELS[user.role] : ''}</p>
              <p className="text-xs text-muted-foreground">Die eigene Rolle kann nicht geändert werden.</p>
            </div>
          ) : (
            <FormField id="eu-role" label="Rolle" error={errors.role?.message}>
              {(c) => (
                <Select {...c} {...form.register('role')}>
                  {roleOptions}
                </Select>
              )}
            </FormField>
          )}
          <FormField
            id="eu-password"
            label="Neues Passwort"
            hint="Leer lassen, um das Passwort zu behalten. Ein neues Passwort meldet den Benutzer überall ab."
            error={errors.password?.message}
          >
            {(c) => <Input {...c} type="password" autoComplete="new-password" {...form.register('password')} />}
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
            Speichern
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export function BillingSettingsDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const save = useUpdateUserSettings()
  const form = useForm<UserSettingsInput>({
    resolver: zodResolver(userSettingsSchema),
    defaultValues: { stundenlohn: 12, abrechnungStart: 1, abrechnungEnde: 31, lohnzettelEmail: '' },
  })
  const { errors } = form.formState

  useEffect(() => {
    if (user) {
      form.reset({
        stundenlohn: Number(user.stundenlohn ?? 12),
        abrechnungStart: user.abrechnungStart ?? 1,
        abrechnungEnde: user.abrechnungEnde ?? 31,
        lohnzettelEmail: user.lohnzettelEmail ?? user.email,
      })
    }
  }, [user, form])

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user) return
    try {
      await save.mutateAsync({ id: user.id, data: values })
      onClose()
    } catch (error) {
      applyServerErrors(error, form.setError, ['stundenlohn', 'abrechnungStart', 'abrechnungEnde', 'lohnzettelEmail'])
    }
  })

  return (
    <Modal open={user !== null} onClose={onClose} title="Abrechnungsdaten" description={user?.name} dismissible={!save.isPending}>
      <form onSubmit={onSubmit} noValidate>
        <ModalBody>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField
            id="bs-rate"
            label="Stundenlohn (€)"
            hint="Gilt für neu erfasste Einträge. Bestehende Einträge behalten ihren Satz."
            error={errors.stundenlohn?.message}
            required
          >
            {(c) => <Input {...c} type="number" step="0.01" min="0" inputMode="decimal" className="max-w-40" {...form.register('stundenlohn', { valueAsNumber: true })} />}
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Abrechnungszeitraum</legend>
            <div className="grid grid-cols-2 gap-4">
              <FormField id="bs-start" label="Von Tag" error={errors.abrechnungStart?.message}>
                {(c) => <Input {...c} type="number" min="1" max="31" {...form.register('abrechnungStart', { valueAsNumber: true })} />}
              </FormField>
              <FormField id="bs-end" label="Bis Tag" error={errors.abrechnungEnde?.message}>
                {(c) => <Input {...c} type="number" min="1" max="31" {...form.register('abrechnungEnde', { valueAsNumber: true })} />}
              </FormField>
            </div>
            <p className="text-xs text-muted-foreground">
              Beispiel: 1 bis 31 = Kalendermonat; 22 bis 21 = vom 22. bis zum 21. des Folgemonats.
            </p>
          </fieldset>
          <FormField id="bs-payslip" label="E-Mail für Lohnzettel" error={errors.lohnzettelEmail?.message}>
            {(c) => <Input {...c} type="email" {...form.register('lohnzettelEmail')} />}
          </FormField>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            Speichern
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
