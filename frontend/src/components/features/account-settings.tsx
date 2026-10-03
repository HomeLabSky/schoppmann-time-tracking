'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/lib/auth'
import { useChangePassword, useMySettings, useUpdatePayslipEmail } from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import { formatCurrency } from '@/lib/utils'
import { passwordChangeSchema, ROLE_LABELS, type PasswordChangeInput } from '@/schemas'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'

const payslipSchema = z.object({
  lohnzettelEmail: z.string().trim().min(1, 'E-Mail ist erforderlich').email('Keine gültige E-Mail-Adresse'),
})

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  )
}

/** Einstellungen des eigenen Kontos – für Mitarbeiter mit Abrechnungsdaten, für Admins nur Konto und Passwort. */
export function AccountSettings({ showBilling }: { showBilling: boolean }) {
  const { user } = useAuth()
  const settings = useMySettings(showBilling)

  return (
    <div className="max-w-3xl">
      <PageHeader title="Einstellungen" description="Ihr Konto, Ihre Abrechnungsdaten und Ihr Passwort." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Konto</CardTitle>
            <CardDescription>Name und Anmelde-E-Mail ändert Ihr Administrator.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Name">{user?.name}</Detail>
              <Detail label="E-Mail (Anmeldung)">{user?.email}</Detail>
              <Detail label="Rolle">{user ? ROLE_LABELS[user.role] : ''}</Detail>
            </dl>
          </CardContent>
        </Card>

        {showBilling && <BillingCard loading={settings.isLoading} settings={settings.data} />}

        <PasswordCard />
      </div>
    </div>
  )
}

function BillingCard({
  loading,
  settings,
}: {
  loading: boolean
  settings?: { stundenlohn: number; abrechnungStart: number; abrechnungEnde: number; lohnzettelEmail: string }
}) {
  const save = useUpdatePayslipEmail()
  const form = useForm<z.infer<typeof payslipSchema>>({ resolver: zodResolver(payslipSchema), defaultValues: { lohnzettelEmail: '' } })
  const { reset } = form

  useEffect(() => {
    if (settings) reset({ lohnzettelEmail: settings.lohnzettelEmail ?? '' })
  }, [settings, reset])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values.lohnzettelEmail)
      reset(values)
    } catch (error) {
      applyServerErrors(error, form.setError, ['lohnzettelEmail'])
    }
  })

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Abrechnung</CardTitle>
          <CardDescription>Stundenlohn und Abrechnungszeitraum legt Ihr Administrator fest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading || !settings ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Stundenlohn">{formatCurrency(Number(settings.stundenlohn))}</Detail>
              <Detail label="Abrechnungszeitraum">
                {settings.abrechnungStart}. bis {settings.abrechnungEnde}. des Monats
              </Detail>
            </dl>
          )}
          {form.formState.errors.root?.server && <Alert variant="danger" title={form.formState.errors.root.server.message} />}
          <FormField
            id="settings-payslip"
            label="E-Mail für Lohnzettel"
            error={form.formState.errors.lohnzettelEmail?.message}
            className="max-w-sm"
          >
            {(c) => <Input {...c} type="email" disabled={!settings} {...form.register('lohnzettelEmail')} />}
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            Speichern
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function PasswordCard() {
  const change = useChangePassword()
  const form = useForm<PasswordChangeInput>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const errors = form.formState.errors

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await change.mutateAsync(values)
      form.reset()
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'INVALID_CURRENT_PASSWORD') {
        form.setError('currentPassword', { message: 'Das aktuelle Passwort ist falsch' })
        return
      }
      applyServerErrors(error, form.setError, ['currentPassword', 'newPassword', 'confirmPassword'], 'Passwort konnte nicht geändert werden')
    }
  })

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Passwort ändern</CardTitle>
          <CardDescription>Andere angemeldete Geräte werden danach abgemeldet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField id="pw-current" label="Aktuelles Passwort" error={errors.currentPassword?.message} className="max-w-sm">
            {(c) => <Input {...c} type="password" autoComplete="current-password" {...form.register('currentPassword')} />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="pw-new"
              label="Neues Passwort"
              hint="Mindestens 8 Zeichen, Groß- und Kleinbuchstaben und eine Zahl."
              error={errors.newPassword?.message}
            >
              {(c) => <Input {...c} type="password" autoComplete="new-password" {...form.register('newPassword')} />}
            </FormField>
            <FormField id="pw-confirm" label="Neues Passwort bestätigen" error={errors.confirmPassword?.message}>
              {(c) => <Input {...c} type="password" autoComplete="new-password" {...form.register('confirmPassword')} />}
            </FormField>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={change.isPending}>
            Passwort ändern
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
