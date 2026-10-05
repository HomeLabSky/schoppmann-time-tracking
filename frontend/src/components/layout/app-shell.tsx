'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { Logo, LogoMark } from '@/components/brand/logo'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { UserMenu } from './user-menu'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Nur exakter Pfad gilt als aktiv (für Startseiten wie `/admin`). */
  exact?: boolean
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

interface AppShellProps {
  sections: NavSection[]
  homeHref: string
  settingsHref: string
  children: React.ReactNode
}

/**
 * Desktop-Grundlayout: feste Seitenleiste mit Navigation und Benutzermenü, Inhalt rechts.
 * Unter 1024 px schrumpft die Leiste auf Symbole (die mobile Nutzung läuft über die App).
 */
export function AppShell({ sections, homeHref, settingsHref, children }: AppShellProps) {
  const pathname = usePathname()
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <div className="min-h-screen">
      <a
        href="#inhalt"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Zum Inhalt springen
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r bg-sidebar lg:w-60">
        <div className="flex h-16 items-center border-b px-3 lg:px-4">
          <Link href={homeHref} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Startseite">
            <Logo className="hidden lg:inline-flex" />
            <LogoMark className="h-7 text-primary lg:hidden" />
          </Link>
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1 space-y-5 overflow-y-auto px-2 py-4 lg:px-3">
          {sections.map((section, i) => (
            <div key={section.title ?? i} className="space-y-1">
              {section.title && (
                <p className="hidden px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const active = isActive(item)
                const Icon = item.icon
                return (
                  <Tooltip key={item.href} content={item.label}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      aria-label={item.label}
                      className={cn(
                        'flex h-9 items-center justify-center gap-3 rounded-md px-2 text-sm font-medium transition-colors lg:justify-start',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-primary')} aria-hidden="true" />
                      <span className="hidden lg:inline">{item.label}</span>
                    </Link>
                  </Tooltip>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="border-t p-2">
          <UserMenu settingsHref={settingsHref} />
        </div>
      </aside>

      <div className="pl-16 lg:pl-60">
        <main id="inhalt" tabIndex={-1} className="mx-auto max-w-7xl px-6 py-8 focus:outline-none lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
