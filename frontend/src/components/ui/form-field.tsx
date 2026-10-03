'use client'

import * as React from 'react'
import { Label } from './label'
import { cn } from '@/lib/utils'

interface FormFieldProps {
  /** id des Eingabefelds; daraus werden die ids für Hinweis und Fehler abgeleitet. */
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  required?: boolean
  className?: string
  /** Erhält die ARIA-Attribute, die an das Eingabefeld gehören. */
  children: (control: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode
}

/**
 * Beschriftetes Formularfeld mit Hinweis und Fehlermeldung (für react-hook-form):
 *
 *   <FormField id="email" label="E-Mail" error={errors.email?.message}>
 *     {(control) => <Input {...control} {...register('email')} />}
 *   </FormField>
 */
export function FormField({ id, label, hint, error, required, className, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
