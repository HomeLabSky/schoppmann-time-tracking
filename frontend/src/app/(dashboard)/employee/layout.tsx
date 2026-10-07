'use client'

import { Clock, FileText, UserCog } from 'lucide-react'
import { AppShell, type NavSection } from '@/components/layout/app-shell'
import { RequireRole } from '@/components/layout/require-role'

const sections: NavSection[] = [
  {
    items: [
      { href: '/employee/dashboard', label: 'Zeiterfassung', icon: Clock },
      { href: '/employee/payslips', label: 'Lohnzettel', icon: FileText },
      { href: '/employee/settings', label: 'Einstellungen', icon: UserCog },
    ],
  },
]

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="mitarbeiter">
      <AppShell sections={sections} homeHref="/employee/dashboard" settingsHref="/employee/settings">
        {children}
      </AppShell>
    </RequireRole>
  )
}
