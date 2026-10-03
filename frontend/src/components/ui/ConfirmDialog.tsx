'use client'

import { useCallback, useRef, useState } from 'react'
import { Modal } from './Modal'
import { cn } from '@/lib/utils'

interface ConfirmOptions {
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  /** Rote Schaltfläche für zerstörende Aktionen (Löschen). */
  destructive?: boolean
}

/**
 * Ersatz für `window.confirm()` mit eigenem, barrierefreiem Dialog.
 *
 *   const [confirm, confirmDialog] = useConfirm()
 *   if (!(await confirm({ title: 'Eintrag löschen?', destructive: true }))) return
 *   …
 *   return <>{…}{confirmDialog}</>
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const dialog = (
    <Modal open={options !== null} onClose={() => settle(false)} title={options?.title ?? ''} size="max-w-sm">
      {options?.message && <div className="px-6 pt-4 text-sm text-gray-600">{options.message}</div>}
      <div className="flex justify-end gap-3 px-6 py-4">
        <button
          type="button"
          onClick={() => settle(false)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={() => settle(true)}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-medium text-white',
            options?.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          )}
        >
          {options?.confirmLabel ?? 'Bestätigen'}
        </button>
      </div>
    </Modal>
  )

  return [confirm, dialog]
}
