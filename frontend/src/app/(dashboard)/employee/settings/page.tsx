'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { employeeApi } from '@/lib/api'
import { formatCurrency, getErrorMessage, validatePassword } from '@/lib/utils'
import type { UserSettings } from '@/types/api'

const inputClass =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500'

type Feedback = { type: 'success' | 'error'; text: string } | null

function FeedbackBox({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  const ok = feedback.type === 'success'
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={`rounded-md border p-3 text-sm ${ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}
    >
      {feedback.text}
    </div>
  )
}

export default function EmployeeSettingsPage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loadError, setLoadError] = useState('')

  const [lohnzettelEmail, setLohnzettelEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null)

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null)

  useEffect(() => {
    employeeApi
      .getSettings()
      .then((res) => {
        setSettings(res.data.settings)
        setLohnzettelEmail(res.data.settings.lohnzettelEmail ?? '')
      })
      .catch((err) => setLoadError(getErrorMessage(err, 'Einstellungen konnten nicht geladen werden')))
  }, [])

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingEmail(true)
    setEmailFeedback(null)
    try {
      const res = await employeeApi.updateSettings({ lohnzettelEmail })
      setSettings(res.data.settings)
      setEmailFeedback({ type: 'success', text: 'Lohnzettel-E-Mail gespeichert.' })
    } catch (err) {
      setEmailFeedback({ type: 'error', text: getErrorMessage(err, 'Speichern fehlgeschlagen') })
    } finally {
      setSavingEmail(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordFeedback(null)
    const check = validatePassword(passwords.newPassword)
    if (!check.isValid) {
      setPasswordFeedback({ type: 'error', text: check.errors.join(', ') })
      return
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordFeedback({ type: 'error', text: 'Die Passwort-Bestätigung stimmt nicht überein.' })
      return
    }
    setSavingPassword(true)
    try {
      await employeeApi.changePassword(passwords)
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordFeedback({
        type: 'success',
        text: 'Passwort geändert. Andere angemeldete Geräte wurden abgemeldet.',
      })
    } catch (err) {
      setPasswordFeedback({ type: 'error', text: getErrorMessage(err, 'Passwort konnte nicht geändert werden') })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Einstellungen</h1>
        <p className="mt-2 text-slate-600">Ihr Konto, Ihre Abrechnungsdaten und Ihr Passwort.</p>
      </div>

      {loadError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      )}

      <div className="space-y-6">
        <section aria-labelledby="account-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="account-heading" className="text-lg font-medium text-slate-900">Konto</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="mt-1 font-medium text-slate-900">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">E-Mail (Anmeldung)</dt>
              <dd className="mt-1 font-medium text-slate-900">{user?.email}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="billing-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="billing-heading" className="text-lg font-medium text-slate-900">Abrechnung</h2>
          <p className="mt-1 text-sm text-slate-500">
            Stundenlohn und Abrechnungszeitraum legt Ihr Administrator fest.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Stundenlohn</dt>
              <dd className="mt-1 font-medium text-slate-900">{settings ? formatCurrency(Number(settings.stundenlohn)) : '–'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Abrechnungszeitraum</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {settings ? `${settings.abrechnungStart}. bis ${settings.abrechnungEnde}. des Monats` : '–'}
              </dd>
            </div>
          </dl>

          <form onSubmit={saveEmail} className="mt-6 space-y-3">
            <div>
              <label htmlFor="settings-lohnzettel" className="mb-1 block text-sm font-medium text-slate-700">
                E-Mail für Lohnzettel
              </label>
              <input
                id="settings-lohnzettel"
                type="email"
                value={lohnzettelEmail}
                onChange={(e) => setLohnzettelEmail(e.target.value)}
                className={inputClass}
                disabled={!settings}
                required
              />
            </div>
            <FeedbackBox feedback={emailFeedback} />
            <button
              type="submit"
              disabled={savingEmail || !settings}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingEmail ? 'Wird gespeichert…' : 'Speichern'}
            </button>
          </form>
        </section>

        <section aria-labelledby="password-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 id="password-heading" className="text-lg font-medium text-slate-900">Passwort ändern</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mindestens 8 Zeichen mit Groß- und Kleinbuchstaben und einer Zahl. Andere Geräte werden danach abgemeldet.
          </p>
          <form onSubmit={savePassword} className="mt-4 space-y-4">
            <div>
              <label htmlFor="settings-current-password" className="mb-1 block text-sm font-medium text-slate-700">
                Aktuelles Passwort
              </label>
              <input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-new-password" className="mb-1 block text-sm font-medium text-slate-700">
                  Neues Passwort
                </label>
                <input
                  id="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="settings-confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
                  Neues Passwort bestätigen
                </label>
                <input
                  id="settings-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <FeedbackBox feedback={passwordFeedback} />
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingPassword ? 'Wird geändert…' : 'Passwort ändern'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
