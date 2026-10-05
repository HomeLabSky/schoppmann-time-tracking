'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const AUTOFOCUS_SELECTOR =
  '[data-autofocus], input:not([readonly]):not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  /** Optionaler Untertitel unter der Überschrift (wird als Beschreibung vorgelesen). */
  description?: React.ReactNode
  children: React.ReactNode
  /** Breite des Dialogs, Standard `max-w-md`. */
  size?: 'max-w-sm' | 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl'
  /** Schließen per Esc/Hintergrund-Klick sperren, z. B. während gespeichert wird. */
  dismissible?: boolean
}

/**
 * Barrierefreier Dialog auf Basis von Radix: Portal, Fokusfalle, Esc, Klick daneben, Fokus-Rückgabe,
 * `aria-labelledby`/`aria-describedby`. Fokus startet im ersten Eingabefeld (oder bei `data-autofocus`).
 * Inhalt mit <ModalBody> und <ModalFooter> gliedern.
 */
export function Modal({ open, onClose, title, description, children, size = 'max-w-md', dismissible = true }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && dismissible && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            // Fokus aufs erste Eingabefeld bzw. ein markiertes Element statt aufs Schließen-X
            const target = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(AUTOFOCUS_SELECTOR)
            if (target) {
              event.preventDefault()
              target.focus()
            }
          }}
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-lg border bg-popover text-popover-foreground shadow-xl focus:outline-none',
            size
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-lg font-semibold leading-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              type="button"
              disabled={!dismissible}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label="Dialog schließen"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function ModalBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-4 px-6 py-5', className)} {...props} />
}

export function ModalFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex justify-end gap-2 border-t bg-muted/40 px-6 py-3', className)} {...props} />
}
