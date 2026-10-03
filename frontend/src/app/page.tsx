'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authUtils, useAuth } from '@/lib/auth'
import { FullPageLoader } from '@/components/layout/require-role'

export default function LandingPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    // Je nach Anmeldung und Rolle weiterleiten
    router.replace(user ? authUtils.getRedirectPath(user) : '/login')
  }, [user, loading, router])

  return <FullPageLoader label="Portal wird geladen…" />
}
