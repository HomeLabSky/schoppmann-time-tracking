'use client'

import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePayrollMailSettings, useSavePayrollMailSettings } from '@/lib/queries'
import { applyServerErrors } from '@/lib/forms'
import { getErrorMessage } from '@/lib/utils'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const schema = z.object({
  recipient: z
    .string()
    .trim()
    .max(255, 'Höchstens 255 Zeichen')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Keine gültige E-Mail-Adresse'),
  subject: z.string().trim().min(1, 'Betreff ist erforderlich').max(200, 'Höchstens 200 Zeichen'),
  body: z.string().trim().min(1, 'Text ist erforderlich').max(5000, 'Höchstens 5000 Zeichen'),
})
type Values = z.infer<typeof schema>

/** Monatsname für die Vorschau (Vormonat: der Monat, der typischerweise gerade abgerechnet wird) */
const exampleMonth = () => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}

const fill = (template: string) => template.replace(/\{monat\}/gi, exampleMonth()).replace(/\{anzahl\}/gi, '5')

/** Admin-Einstellung: Empfänger und Text für „An Buchhaltung senden“ (Monatsabschluss unter Zeitnachweise). */
export function PayrollMailSettingsCard() {
  const info = usePayrollMailSettings()
  const save = useSavePayrollMailSettings()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { recipient: '', subject: '', body: '' } })
  const { reset, register, control } = form
  const errors = form.formState.errors

  useEffect(() => {
    if (info.data) {
      const { recipient, subject, body } = info.data.settings
      reset({ recipient, subject, body })
    }
  }, [info.data, reset])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values)
      reset(values)
    } catch (error) {
      applyServerErrors(error, form.setError, ['recipient', 'subject', 'body'], 'Einstellungen konnten nicht gespeichert werden')
    }
  })

  const [subject, body] = useWatch({ control, name: ['subject', 'body'] })

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Lohnabrechnung per E-Mail</CardTitle>
          <CardDescription>
            Sind alle Perioden eines Monats abgeschlossen, sendet „An Buchhaltung senden“ unter Zeitnachweise alle Lohnzettel als
            eine PDF an diese Adresse. Platzhalter: <code>{'{monat}'}</code> (z. B. „{exampleMonth()}“) und{' '}
            <code>{'{anzahl}'}</code> (Zahl der Lohnzettel).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {info.isError && (
            <Alert variant="danger" title="Einstellungen konnten nicht geladen werden">
              {getErrorMessage(info.error)}
            </Alert>
          )}
          {info.data && !info.data.smtpConfigured && (
            <Alert variant="warning" title="Mailserver nicht eingerichtet">
              Auf dem Server fehlen die Angaben zum Mailserver (SMTP_HOST und SMTP_FROM in der .env). Bis dahin kann nicht
              gesendet werden.
            </Alert>
          )}
          {errors.root?.server && <Alert variant="danger" title={errors.root.server.message} />}
          {info.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <FormField
                id="payroll-mail-recipient"
                label="Empfänger"
                hint={
                  info.data?.sender
                    ? `Absender: ${info.data.sender}. Antworten gehen an den Admin, der sendet. Leer = Versand aus.`
                    : 'Leer = Versand aus.'
                }
                error={errors.recipient?.message}
                className="max-w-sm"
              >
                {(c) => <Input {...c} type="email" placeholder="buchhaltung@firma.de" {...register('recipient')} />}
              </FormField>
              <FormField id="payroll-mail-subject" label="Betreff" error={errors.subject?.message}>
                {(c) => <Input {...c} {...register('subject')} />}
              </FormField>
              <FormField id="payroll-mail-body" label="Text" error={errors.body?.message}>
                {(c) => <Textarea {...c} rows={7} {...register('body')} />}
              </FormField>
              <div className="rounded-md border bg-muted/40 p-3 text-sm" aria-label="Vorschau">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vorschau</p>
                <p className="font-medium">{fill(subject ?? '')}</p>
                <p className="mt-2 whitespace-pre-line">{fill(body ?? '')}</p>
                <p className="mt-2 text-xs text-muted-foreground">Anhang: Lohnzettel_JJJJ-MM_alle.pdf</p>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty || !info.data}>
            Speichern
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
