'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authUtils, useAuth } from '@/lib/auth'

export default function LandingPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    // Je nach Anmeldung und Rolle weiterleiten
    router.replace(user ? authUtils.getRedirectPath(user) : '/login')
  }, [user, loading, router])

  // Ladeanzeige, während geprüft wird, ob eine Sitzung besteht
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-stone-100 to-slate-200 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="mb-6">
          <img
            src="/Schoppmann_Logo.png"
            alt="SCHOPPMANN Immobilien & Vermögensverwaltung"
            className="w-48 h-auto mx-auto"
          />
        </div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-700 mx-auto mb-4"></div>
        <p className="text-slate-600 font-medium">Portal wird geladen...</p>
      </div>
    </div>
  )
}
