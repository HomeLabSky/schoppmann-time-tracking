import * as React from 'react'
import { Card } from './card'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: React.ReactNode
  value: React.ReactNode
  /** Zusatzzeile unter dem Wert (z. B. „von 603,00 €“). */
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'success' | 'warning' | 'danger'
  loading?: boolean
  children?: React.ReactNode
  className?: string
}

const toneClass = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/** Kennzahl-Kachel: Beschriftung, großer Wert, optional Hinweis/Fortschritt. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'default', loading, children, className }: StatCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p className={cn('tabular mt-2 text-2xl font-semibold tracking-tight', toneClass[tone])}>{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </Card>
  )
}

/** Fortschrittsbalken, z. B. Ausschöpfung der Minijob-Grenze. */
export function Progress({ value, tone = 'default', label }: { value: number; tone?: StatCardProps['tone']; label: string }) {
  const pct = Math.max(0, Math.min(100, value))
  const bar = { default: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone]
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  )
}
