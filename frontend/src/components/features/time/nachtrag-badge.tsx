import { Badge } from '@/components/ui/badge'
import type { TimeRecord } from '@/lib/timetracking'
import { formatDate } from '@/lib/utils'

/** Kennzeichnet einen Nachtrag: Arbeitstag aus einer abgeschlossenen Periode, abgerechnet in einer späteren. */
export function NachtragBadge({ entry }: { entry: Pick<TimeRecord, 'date' | 'billingDate'> }) {
  if (!entry.billingDate) return null
  return (
    <Badge
      variant="info"
      className="ml-2"
      title={`Nachtrag: Der ${formatDate(entry.date)} lag beim Erfassen in einer bereits abgeschlossenen Periode und wird in dieser Periode abgerechnet.`}
    >
      Nachtrag
    </Badge>
  )
}
