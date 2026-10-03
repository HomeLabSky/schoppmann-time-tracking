'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import Link from 'next/link'

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user: currentUser, loading, logout } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!currentUser) {
      router.replace('/login')
    } else if (currentUser.role === 'admin') {
      // Admin im Mitarbeiterbereich → zum Admin-Dashboard
      router.replace('/admin')
    }
  }, [currentUser, loading, router])

  if (loading || !currentUser || currentUser.role === 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Dashboard wird geladen...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            {/* Logo & Title */}
            <div className="flex items-center space-x-4">
              <img
                src="/Schoppmann_Logo.png"
                alt="SCHOPPMANN"
                className="w-8 h-8"
              />
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Mitarbeiter-Portal</h1>
                <p className="text-sm text-slate-500">Ihr Arbeitsbereich</p>
              </div>
            </div>

            {/* Navigation */}
            <nav aria-label="Hauptnavigation" className="flex gap-2 lg:gap-6">
              {[
                { href: '/employee/dashboard', label: 'Zeiterfassung' },
                { href: '/employee/settings', label: 'Einstellungen' },
              ].map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* User Info & Actions */}
            <div className="flex items-center space-x-6">
              {/* User Info */}
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-slate-900">{currentUser?.name}</p>
                <p className="text-xs text-slate-500">Mitarbeiter</p>
              </div>

              {/* User Avatar */}
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {currentUser?.name?.charAt(0)}
                </span>
              </div>

              {/* Logout */}
              <button
                onClick={logout}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Abmelden"
                aria-label="Abmelden"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {children}
    </>
  )
}