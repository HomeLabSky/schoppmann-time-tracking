'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { formatMonth, monthFromToday } from './period-status'

/** Monatswahl mit Vor/Zurück: die letzten `back` Monate bis `forward` Monate voraus. */
export function MonthPicker({
  value,
  onChange,
  back = 18,
  forward = 1,
  id = 'month-picker',
}: {
  value: string
  onChange: (month: string) => void
  back?: number
  forward?: number
  id?: string
}) {
  const months = Array.from({ length: back + forward + 1 }, (_, i) => monthFromToday(forward - i))
  const index = months.indexOf(value)
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        aria-label="Vorheriger Monat"
        disabled={index === -1 || index >= months.length - 1}
        onClick={() => onChange(months[index + 1])}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <label htmlFor={id} className="sr-only">
        Abrechnungsmonat
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-44">
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
      </Select>
      <Button variant="outline" size="icon" aria-label="Nächster Monat" disabled={index <= 0} onClick={() => onChange(months[index - 1])}>
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  )
}
