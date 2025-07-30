'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const result = await login(formData.email, formData.password)
    
    if (result.success) {
      setMessage(`✅ ${result.message}`)
    } else {
      setMessage(`❌ ${result.error}`)
    }
    
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 border border-slate-200">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-6">
            <img
              src="/Schoppmann_Logo.png"
              alt="SCHOPPMANN Immobilien & Vermögensverwaltung"
              className="w-48 h-auto"
            />
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-slate-700 mb-2">
            Portal-Zugang
          </h2>
          <p className="text-slate-600">
            Melden Sie sich in Ihrem Verwaltungsbereich an
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              E-Mail-Adresse
            </label>
            <input
              type="email"
              placeholder="ihre.email@unternehmen.de"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-slate-500 focus:outline-none transition-colors text-slate-800 placeholder-slate-400 bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Passwort
            </label>
            <input
              type="password"
              placeholder="Ihr Passwort"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-slate-500 focus:outline-none transition-colors text-slate-800 placeholder-slate-400 bg-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-700 text-white font-semibold py-4 px-6 rounded-lg hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Anmeldung läuft...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Anmelden
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200 text-center">
          <p className="text-slate-600 mb-4">
            Noch kein Zugang?
          </p>
          <Link
            href="/register"
            className="text-slate-700 hover:text-slate-900 font-semibold hover:underline transition-colors"
          >
            Konto erstellen
          </Link>
        </div>

        {message && (
          <div className={`mt-6 p-4 rounded-lg border ${
            message.includes('✅')
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="text-sm font-medium">{message}</div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-500">
            © 2024 SCHOPPMANN Immobilien &amp; Vermögensverwaltung
          </p>
        </div>
      </div>
    </div>
  )
}