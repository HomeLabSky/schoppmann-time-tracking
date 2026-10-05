'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { loginSchema, type LoginInput } from '@/schemas'
import { Logo } from '@/components/brand/logo'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const { login } = useAuth()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = async (values: LoginInput) => {
    const result = await login(values.email, values.password)
    if (!result.success) {
      setError('root.server', { message: result.error ?? 'Anmeldung fehlgeschlagen' })
    }
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-6">
        <Logo className="lg:hidden" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
          <p className="text-sm text-muted-foreground">Mit Ihrer geschäftlichen E-Mail-Adresse.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}

        <FormField id="login-email" label="E-Mail-Adresse" error={errors.email?.message}>
          {(control) => (
            <Input {...control} type="email" autoComplete="username" autoFocus placeholder="name@schoppmann.de" {...register('email')} />
          )}
        </FormField>

        <FormField id="login-password" label="Passwort" error={errors.password?.message}>
          {(control) => <Input {...control} type="password" autoComplete="current-password" {...register('password')} />}
        </FormField>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          {!isSubmitting && <LogIn aria-hidden="true" />}
          Anmelden
        </Button>
      </form>

      {process.env.NEXT_PUBLIC_ALLOW_REGISTRATION === 'true' ? (
        <p className="text-center text-sm text-muted-foreground">
          Noch kein Zugang?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Konto erstellen
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Zugang und neues Passwort erhalten Sie von Ihrem Administrator.
        </p>
      )}
    </div>
  )
}
