import { AlertTriangle, CheckCircle2, CircleDashed, Lock, MinusCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type PeriodStatus = 'open' | 'ready' | 'closed'

/** Status einer Abrechnungsperiode – Farbe plus Text und Symbol (nie nur Farbe). */
export function PeriodStatusBadge({ status, limitMissing, empty }: { status: PeriodStatus; limitMissing?: boolean; empty?: boolean }) {
  if (status === 'closed') {
    return (
      <Badge variant="solid">
        <Lock aria-hidden="true" /> Abgeschlossen
      </Badge>
    )
  }
  // Weder Stunden noch Übertrag: nichts abzuschließen
  if (empty) {
    return (
      <Badge variant="neutral">
        <MinusCircle aria-hidden="true" /> Keine Stunden
      </Badge>
    )
  }
  if (limitMissing) {
    return (
      <Badge variant="warning">
        <AlertTriangle aria-hidden="true" /> Grenze fehlt
      </Badge>
    )
  }
  if (status === 'ready') {
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden="true" /> Bereit zum Abschluss
      </Badge>
    )
  }
  return (
    <Badge variant="neutral">
      <CircleDashed aria-hidden="true" /> Läuft
    </Badge>
  )
}

/** Referenzmonat (YYYY-MM) relativ zu heute, z. B. offset -1 = Vormonat. */
export function monthFromToday(offset = 0, today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-09" → "September 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}
