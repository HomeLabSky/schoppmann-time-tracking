'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  /** Optionaler Untertitel unter der Überschrift (wird als Beschreibung vorgelesen). */
  description?: React.ReactNode
  children: React.ReactNode
  /** Breite des Dialogs (Tailwind-Klasse), Standard `max-w-md`. */
  size?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl'
  /** Schließen per Esc/Hintergrund-Klick sperren, z. B. während gespeichert wird. */
  dismissible?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Barrierefreier Dialog: `role="dialog"`, `aria-modal`, Überschrift als Name,
 * Esc und Klick auf den Hintergrund schließen, Fokus bleibt im Dialog und
 * kehrt beim Schließen zum auslösenden Element zurück.
 */
export function Modal({ open, onClose, title, description, children, size = 'max-w-md', dismissible = true }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const dismissibleRef = useRef(dismissible)
  dismissibleRef.current = dismissible

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // Erstes Eingabefeld fokussieren, sonst den Dialog selbst
    const first = panel?.querySelector<HTMLElement>('input, select, textarea') ?? panel
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn('w-full max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl focus:outline-none', size)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h3>
            {description && <p id={descriptionId} className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Dialog schließen"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
