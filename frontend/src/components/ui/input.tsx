import * as React from 'react'
import { cn } from '@/lib/utils'

export const controlClass =
  'flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(controlClass, 'h-9', className)} {...props} />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(controlClass, 'min-h-20', className)} {...props} />
)
Textarea.displayName = 'Textarea'

/** Natives Auswahlfeld im Design des Systems (tastatur- und screenreader-tauglich ohne Zusatzlogik). */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(controlClass, 'h-9 py-1.5', className)} {...props}>
      {children}
    </select>
  )
)
Select.displayName = 'Select'
