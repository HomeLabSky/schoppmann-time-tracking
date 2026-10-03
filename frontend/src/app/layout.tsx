import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Zeiterfassung · SCHOPPMANN',
    template: '%s · SCHOPPMANN Zeiterfassung',
  },
  description: 'Zeiterfassung und Minijob-Abrechnung der SCHOPPMANN Immobilien & Vermögensverwaltung',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes setzt die Klasse "dark" vor dem ersten Rendern
    <html lang="de" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
