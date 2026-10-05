'use client'

import { CalendarCheck, LayoutDashboard, ScrollText, Settings2, Users } from 'lucide-react'
import { AppShell, type NavSection } from '@/components/layout/app-shell'
import { RequireRole } from '@/components/layout/require-role'

const sections: NavSection[] = [
  { items: [{ href: '/admin', label: 'Übersicht', icon: LayoutDashboard, exact: true }] },
  {
    title: 'Abrechnung',
    items: [
      { href: '/admin/timesheets', label: 'Zeitnachweise', icon: CalendarCheck },
      { href: '/admin/minijob', label: 'Minijob-Grenzen', icon: Settings2 },
    ],
  },
  {
    title: 'Verwaltung',
    items: [
      { href: '/admin/users', label: 'Benutzer', icon: Users },
      { href: '/admin/audit', label: 'Protokoll', icon: ScrollText },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <AppShell sections={sections} homeHref="/admin" settingsHref="/admin/settings">
        {children}
      </AppShell>
    </RequireRole>
  )
}
