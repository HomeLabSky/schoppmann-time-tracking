'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('accessToken')
    const userData = localStorage.getItem('user')
    
    if (token && userData) {
      try {
        const user = JSON.parse(userData)
        // Redirect based on role
        if (user.role === 'admin') {
          router.push('/admin')
        } else {
          router.push('/employee/dashboard')
        }
      } catch (error) {
        // Invalid stored data, clear and redirect to login
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        router.push('/login')
      }
    } else {
      // Not logged in, redirect to login
      router.push('/login')
    }
  }, [router])

  // Loading screen while checking auth
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