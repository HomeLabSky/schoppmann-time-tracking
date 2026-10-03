'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { z } from 'zod'
import { useAuth } from '@/lib/auth'
import { passwordSchema, userCreateSchema } from '@/schemas'
import { Logo } from '@/components/brand/logo'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

const registerSchema = userCreateSchema
  .pick({ name: true, email: true })
  .extend({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwörter stimmen nicht überein' })
type RegisterInput = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const { register: registerUser } = useAuth()
  const enabled = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION === 'true'
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '', confirmPassword: '' } })

  const onSubmit = async ({ name, email, password }: RegisterInput) => {
    const result = await registerUser({ name, email, password })
    if (!result.success) setError('root.server', { message: result.error ?? 'Registrierung fehlgeschlagen' })
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-6">
        <Logo className="lg:hidden" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Konto erstellen</h1>
          <p className="text-sm text-muted-foreground">Für Mitarbeiterinnen und Mitarbeiter.</p>
        </div>
      </div>

      {!enabled ? (
        <Alert variant="info" title="Selbstregistrierung ist deaktiviert">
          Konten legt Ihr Administrator an.{' '}
          <Link href="/login" className="font-medium text-foreground underline">
            Zur Anmeldung
          </Link>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          <FormField id="reg-name" label="Vollständiger Name" error={errors.name?.message}>
            {(c) => <Input {...c} autoComplete="name" {...register('name')} />}
          </FormField>
          <FormField id="reg-email" label="E-Mail-Adresse" error={errors.email?.message}>
            {(c) => <Input {...c} type="email" autoComplete="email" {...register('email')} />}
          </FormField>
          <FormField
            id="reg-password"
            label="Passwort"
            hint="Mindestens 8 Zeichen, Groß- und Kleinbuchstaben und eine Zahl."
            error={errors.password?.message}
          >
            {(c) => <Input {...c} type="password" autoComplete="new-password" {...register('password')} />}
          </FormField>
          <FormField id="reg-confirm" label="Passwort bestätigen" error={errors.confirmPassword?.message}>
            {(c) => <Input {...c} type="password" autoComplete="new-password" {...register('confirmPassword')} />}
          </FormField>
          <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
            Konto erstellen
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Bereits registriert?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Anmelden
            </Link>
          </p>
        </form>
      )}
    </div>
  )
}
