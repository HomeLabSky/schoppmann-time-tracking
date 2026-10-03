'use client'

import { Suspense, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { MonthPicker } from '@/components/features/month-picker'
import { monthFromToday } from '@/components/features/period-status'
import { TimesheetOverview } from '@/components/features/timesheets/timesheet-overview'
import { TimesheetDetail } from '@/components/features/timesheets/timesheet-detail'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function TimesheetsContent() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Standard: Vormonat – der wird typischerweise geprüft und abgeschlossen
  const monthParam = params.get('month')
  const month = monthParam && MONTH_PATTERN.test(monthParam) ? monthParam : monthFromToday(-1)
  const userParam = Number(params.get('user'))
  const userId = Number.isInteger(userParam) && userParam > 0 ? userParam : null

  const navigate = useCallback(
    (next: { month?: string; user?: number | null }) => {
      const search = new URLSearchParams()
      search.set('month', next.month ?? month)
      const user = next.user === undefined ? userId : next.user
      if (user) search.set('user', String(user))
      router.push(`${pathname}?${search.toString()}`, { scroll: false })
    },
    [router, pathname, month, userId]
  )

  return (
    <>
      <PageHeader
        title="Zeitnachweise"
        description="Zeiten prüfen und Abrechnungsperioden abschließen. Abgeschlossene Perioden sind für Mitarbeiter gesperrt."
        actions={<MonthPicker value={month} onChange={(m) => navigate({ month: m })} />}
      />
      {userId ? (
        <TimesheetDetail userId={userId} month={month} onBack={() => navigate({ user: null })} onSelectUser={(id) => navigate({ user: id })} />
      ) : (
        <TimesheetOverview month={month} onOpen={(id) => navigate({ user: id })} />
      )}
    </>
  )
}

export default function TimesheetsPage() {
  // useSearchParams braucht eine Suspense-Grenze (statischer Build)
  return (
    <Suspense>
      <TimesheetsContent />
    </Suspense>
  )
}
