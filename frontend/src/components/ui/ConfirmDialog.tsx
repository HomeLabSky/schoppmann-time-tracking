'use client'

import { useCallback, useRef, useState } from 'react'
import { Modal, ModalBody, ModalFooter } from './Modal'
import { Button } from './button'

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
      {options?.message && <ModalBody className="text-sm text-muted-foreground">{options.message}</ModalBody>}
      <ModalFooter>
        {/* Fokus auf „Abbrechen“: Enter löst nie versehentlich eine Löschung aus */}
        <Button variant="outline" onClick={() => settle(false)} data-autofocus>
          Abbrechen
        </Button>
        <Button variant={options?.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>
          {options?.confirmLabel ?? 'Bestätigen'}
        </Button>
      </ModalFooter>
    </Modal>
  )

  return [confirm, dialog]
}
