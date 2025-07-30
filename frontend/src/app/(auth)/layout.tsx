'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('accessToken')
    const userData = localStorage.getItem('user')
    
    if (token && userData) {
      try {
        const user = JSON.parse(userData)
        // User is already logged in, redirect to appropriate dashboard
        if (user.role === 'admin') {
          router.push('/admin')
        } else {
          router.push('/employee/dashboard')
        }
      } catch (error) {
        // Invalid stored data, clear it
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
      }
    }
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-stone-100 to-slate-200">
      {children}
    </div>
  )
}