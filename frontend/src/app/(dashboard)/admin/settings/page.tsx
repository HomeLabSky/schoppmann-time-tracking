'use client'

import { AccountSettings } from '@/components/features/account-settings'
import { PayrollMailSettingsCard } from '@/components/features/payroll-mail-settings'

export default function AdminSettingsPage() {
  return (
    <AccountSettings showBilling={false}>
      <PayrollMailSettingsCard />
    </AccountSettings>
  )
}
