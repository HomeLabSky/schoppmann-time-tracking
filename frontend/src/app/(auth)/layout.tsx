'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authUtils, useAuth } from '@/lib/auth'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    // Wer schon angemeldet ist, braucht die Anmeldeseite nicht
    if (!loading && user) {
      router.replace(authUtils.getRedirectPath(user))
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-stone-100 to-slate-200">
      {children}
    </div>
  )
}
