'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authUtils, useAuth } from '@/lib/auth'
import { LogoMark } from '@/components/brand/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    // Wer schon angemeldet ist, braucht die Anmeldeseite nicht
    if (!loading && user) {
      router.replace(authUtils.getRedirectPath(user))
    }
  }, [user, loading, router])

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Markenfläche (nur Desktop) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#1f3a5f] p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 text-white" />
          <div className="leading-none">
            <p className="font-serif text-lg font-semibold tracking-wide">SCHOPPMANN</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/70">Immobilien &amp; Vermögensverwaltung</p>
          </div>
        </div>
        <div className="max-w-md space-y-3">
          <h2 className="text-3xl font-semibold leading-tight">Zeiterfassung und Minijob-Abrechnung an einem Ort.</h2>
          <p className="text-white/75">
            Arbeitszeiten erfassen, Perioden prüfen und abschließen – nachvollziehbar und mit Änderungsprotokoll.
          </p>
        </div>
        <p className="text-xs text-white/60">© {new Date().getFullYear()} SCHOPPMANN Immobilien &amp; Vermögensverwaltung</p>
        <LogoMark className="pointer-events-none absolute -bottom-16 -right-20 h-96 text-white/[0.06]" />
      </div>

      <main className="flex items-center justify-center bg-background p-6">{children}</main>
    </div>
  )
}
