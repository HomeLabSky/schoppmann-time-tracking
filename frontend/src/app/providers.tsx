'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/lib/auth'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ApiError } from '@/types/api'

/** Fehler, bei denen eine Wiederholung nichts bringt (Validierung, Rechte, nicht gefunden). */
const isClientError = (error: unknown) => {
  const status = (error as ApiError)?.status
  return typeof status === 'number' && status >= 400 && status < 500
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
          },
          mutations: { retry: false },
        },
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </AuthProvider>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
