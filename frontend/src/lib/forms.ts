import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { ApiError } from '@/types/api'
import { getErrorMessage } from './utils'

/**
 * Überträgt Fehler aus einer API-Antwort auf das Formular: feldgenaue Meldungen des Backends
 * (`fields`) landen am jeweiligen Feld, der Rest als Formularfehler (`root.server`).
 * Gibt die allgemeine Meldung zurück (oder null, wenn alles einem Feld zugeordnet wurde).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
  fallback = 'Speichern fehlgeschlagen'
): string | null {
  const apiError = error as ApiError
  let assigned = false
  if (apiError?.fields) {
    for (const [field, message] of Object.entries(apiError.fields)) {
      if ((knownFields as readonly string[]).includes(field)) {
        setError(field as Path<T>, { type: 'server', message })
        assigned = true
      }
    }
  }
  if (assigned && Object.keys(apiError.fields ?? {}).every((f) => (knownFields as readonly string[]).includes(f))) {
    return null
  }
  const message = getErrorMessage(error, fallback)
  setError('root.server' as Path<T>, { type: 'server', message })
  return message
}
