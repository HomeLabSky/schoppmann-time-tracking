// frontend/src/app/(auth)/register/page.tsx - KORRIGIERTE VERSION

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export default function RegisterPage() {
  const { register } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({
    hasMinLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false
  })

  const validatePassword = (password: string) => {
    setPasswordStrength({
      hasMinLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password)
    })
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const password = e.target.value
    setFormData({ ...formData, password })
    validatePassword(password)
  }

  const isPasswordValid = () => {
    return Object.values(passwordStrength).every(Boolean)
  }

  const isFormValid = () => {
    return (
      formData.name.trim().length >= 2 &&
      formData.email.includes('@') &&
      isPasswordValid() &&
      formData.password === formData.confirmPassword
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isFormValid()) {
      setMessage('❌ Bitte überprüfen Sie Ihre Eingaben')
      return
    }

    setLoading(true)
    setMessage('')

    const result = await register({
      name: formData.name.trim(),
      email: formData.email.trim(),
      password: formData.password
    })
    
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
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-slate-700 mb-2">
            Konto erstellen
          </h2>
          <p className="text-slate-600 text-center">
            Registrieren Sie sich für das SCHOPPMANN Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Vollständiger Name
            </label>
            <input
              type="text"
              placeholder="Max Mustermann"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-slate-500 focus:outline-none transition-colors text-slate-800 placeholder-slate-400 bg-white"
              required
              minLength={2}
            />
            {formData.name && formData.name.length < 2 && (
              <p className="text-red-500 text-xs mt-1">Name muss mindestens 2 Zeichen haben</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              E-Mail-Adresse
            </label>
            <input
              type="email"
              placeholder="max.mustermann@unternehmen.de"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-slate-500 focus:outline-none transition-colors text-slate-800 placeholder-slate-400 bg-white"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Passwort
            </label>
            <input
              type="password"
              placeholder="Sicheres Passwort eingeben"
              value={formData.password}
              onChange={handlePasswordChange}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-slate-500 focus:outline-none transition-colors text-slate-800 placeholder-slate-400 bg-white"
              required
            />
            
            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center space-x-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${passwordStrength.hasMinLength ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <span className={passwordStrength.hasMinLength ? 'text-green-600' : 'text-gray-500'}>
                    Mindestens 8 Zeichen
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${passwordStrength.hasUpperCase ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <span className={passwordStrength.hasUpperCase ? 'text-green-600' : 'text-gray-500'}>
                    Großbuchstabe
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${passwordStrength.hasLowerCase ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <span className={passwordStrength.hasLowerCase ? 'text-green-600' : 'text-gray-500'}>
                    Kleinbuchstabe
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${passwordStrength.hasNumber ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <span className={passwordStrength.hasNumber ? 'text-green-600' : 'text-gray-500'}>
                    Zahl
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Passwort bestätigen
            </label>
            <input
              type="password"
              placeholder="Passwort wiederholen"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:border-slate-500 focus:outline-none transition-colors text-slate-800 placeholder-slate-400 bg-white"
              required
            />
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">Passwörter stimmen nicht überein</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !isFormValid()}
            className="w-full bg-slate-700 text-white font-semibold py-4 px-6 rounded-lg hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Registrierung läuft...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                </svg>
                Konto erstellen
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 text-center">
          <p className="text-slate-600 mb-4">
            Bereits ein Konto vorhanden?
          </p>
          <Link
            href="/login"
            className="text-slate-700 hover:text-slate-900 font-semibold hover:underline transition-colors"
          >
            Anmelden
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