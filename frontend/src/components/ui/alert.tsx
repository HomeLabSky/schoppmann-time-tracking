import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const alertVariants = cva('flex gap-3 rounded-lg border p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0', {
  variants: {
    variant: {
      info: 'border-info/30 bg-info-soft [&>svg]:text-info',
      success: 'border-success/30 bg-success-soft [&>svg]:text-success',
      warning: 'border-warning/40 bg-warning-soft [&>svg]:text-warning',
      danger: 'border-danger/30 bg-danger-soft [&>svg]:text-danger',
    },
  },
  defaultVariants: { variant: 'info' },
})

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle }

interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: React.ReactNode
  /** Zusätzliche Schaltfläche/Link rechts (z. B. „Grenze anlegen“). */
  action?: React.ReactNode
}

/** Hinweisbox. Fehler/Warnungen werden als `alert` vorgelesen, Info/Erfolg als `status`. */
export function Alert({ className, variant = 'info', title, action, children, ...props }: AlertProps) {
  const Icon = icons[variant ?? 'info']
  const urgent = variant === 'danger' || variant === 'warning'
  return (
    <div role={urgent ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon aria-hidden="true" />
      <div className="flex-1 space-y-1">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}
