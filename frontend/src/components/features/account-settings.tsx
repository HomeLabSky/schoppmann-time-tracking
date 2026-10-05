'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/lib/auth'
import { LogOut, Monitor, Smartphone } from 'lucide-react'
import {
  useChangePassword,
  useMySessions,
  useMySettings,
  useRevokeOtherSessions,
  useRevokeSession,
  useUpdatePayslipEmail,
} from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import { formatCurrency, formatDateTime, formatRelativeTime, getErrorMessage } from '@/lib/utils'
import type { SessionInfo } from '@/types/api'
import { passwordChangeSchema, ROLE_LABELS, type PasswordChangeInput } from '@/schemas'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
      <PageHeader title="Einstellungen" description="Ihr Konto, Ihre Abrechnungsdaten, Ihr Passwort und angemeldete Geräte." />
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

        <SessionsCard />
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

function SessionRow({ session, onRevoke, busy }: { session: SessionInfo; onRevoke: (s: SessionInfo) => void; busy: boolean }) {
  const Icon = session.clientType === 'app' ? Smartphone : Monitor
  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span className="truncate">{session.label}</span>
          <Badge variant="outline">{session.clientType === 'app' ? 'App' : 'Browser'}</Badge>
          {session.current && <Badge variant="success">Dieses Gerät</Badge>}
        </p>
        <p className="tabular text-xs text-muted-foreground">
          {session.current ? 'Jetzt aktiv' : `Zuletzt aktiv ${formatRelativeTime(session.lastUsedAt)}`}
          {' · '}angemeldet {formatDateTime(session.createdAt)}
          {session.ip && <> · IP {session.ip}</>}
        </p>
      </div>
      {!session.current && (
        <Button variant="outline" size="sm" onClick={() => onRevoke(session)} disabled={busy} aria-label={`${session.label} abmelden`}>
          Abmelden
        </Button>
      )}
    </li>
  )
}

/** Angemeldete Browser und App-Geräte: einzeln oder überall abmelden (z. B. nach Verlust eines Geräts). */
function SessionsCard() {
  const { logout } = useAuth()
  const sessions = useMySessions()
  const revoke = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()
  const [confirm, confirmDialog] = useConfirm()
  const list = sessions.data ?? []
  const others = list.filter((s) => !s.current).length
  const busy = revoke.isPending || revokeOthers.isPending

  const askRevoke = async (s: SessionInfo) => {
    const ok = await confirm({
      title: `${s.label} abmelden?`,
      message: 'Dort ist danach eine neue Anmeldung nötig.',
      confirmLabel: 'Abmelden',
      destructive: true,
    })
    if (ok) revoke.mutate(s.id)
  }
  const askRevokeOthers = async () => {
    const ok = await confirm({
      title: 'Auf allen anderen Geräten abmelden?',
      message: `${others} ${others === 1 ? 'Sitzung wird' : 'Sitzungen werden'} sofort beendet. Dieses Gerät bleibt angemeldet.`,
      confirmLabel: 'Andere abmelden',
      destructive: true,
    })
    if (ok) revokeOthers.mutate()
  }
  const askRevokeAll = async () => {
    const ok = await confirm({
      title: 'Überall abmelden?',
      message: 'Alle Sitzungen werden beendet – auch auf diesem Gerät. Danach ist überall eine neue Anmeldung nötig.',
      confirmLabel: 'Überall abmelden',
      destructive: true,
    })
    if (!ok) return
    if (others > 0) await revokeOthers.mutateAsync().catch(() => undefined)
    await logout()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Angemeldete Geräte</CardTitle>
        <CardDescription>
          Browser und Apps, in denen Sie angemeldet sind. Unbekanntes Gerät oder Handy verloren? Dort abmelden und das Passwort ändern.
        </CardDescription>
      </CardHeader>
      {sessions.isError ? (
        <CardContent>
          <Alert variant="danger" title={getErrorMessage(sessions.error, 'Geräte konnten nicht geladen werden')} />
        </CardContent>
      ) : sessions.isLoading ? (
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      ) : (
        <ul className="divide-y border-t" aria-label="Angemeldete Geräte">
          {list.map((s) => (
            <SessionRow key={s.id} session={s} onRevoke={askRevoke} busy={busy} />
          ))}
        </ul>
      )}
      <CardFooter className="flex-wrap justify-end">
        <Button variant="outline" onClick={askRevokeAll} disabled={busy}>
          <LogOut aria-hidden="true" /> Überall abmelden
        </Button>
        <Button onClick={askRevokeOthers} disabled={busy || others === 0} loading={revokeOthers.isPending}>
          Auf allen anderen Geräten abmelden
        </Button>
      </CardFooter>
      {confirmDialog}
    </Card>
  )
}
