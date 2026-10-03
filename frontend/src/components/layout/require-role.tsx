'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authUtils, useAuth } from '@/lib/auth'
import { LogoMark } from '@/components/brand/logo'
import type { User } from '@/types/api'

/**
 * Seitenschutz an einer Stelle: nicht angemeldet → Anmeldung, falsche Rolle → eigener Bereich.
 * Maßgeblich ist die Rechteprüfung im Backend; das hier verhindert nur, dass fremde Seiten aufblitzen.
 *
 * Eine Next-Middleware kann das nicht übernehmen: Die Sitzungs-Cookies gelten nur für `/api` bzw.
 * `/api/auth` und werden beim Aufruf einer Seite nicht mitgeschickt.
 */
export function RequireRole({ role, children }: { role: User['role']; children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) router.replace('/login')
    else if (user.role !== role) router.replace(authUtils.getRedirectPath(user))
  }, [user, loading, role, router])

  if (loading || !user || user.role !== role) {
    return <FullPageLoader label="Sitzung wird geprüft…" />
  }
  return <>{children}</>
}

export function FullPageLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <LogoMark className="h-12 animate-pulse text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
