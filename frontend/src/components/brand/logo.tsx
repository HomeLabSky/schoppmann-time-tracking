import { cn } from '@/lib/utils'

/**
 * Bildmarke (Häuser-Silhouette aus dem Firmenlogo) als SVG in `currentColor`:
 * scharf in jeder Größe, passt sich Hell/Dunkel an und ersetzt das 1,1-MB-PNG.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.2}
      strokeLinejoin="miter"
      className={cn('h-8 w-auto', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* linkes Haus */}
      <path d="M11 41V23.5L19.5 16L26 21.5" />
      {/* mittleres, hohes Haus */}
      <path d="M26 41V13.5L35 5.5L44 13.5V41" />
      {/* rechtes Haus */}
      <path d="M44 22H54V41" />
      {/* Fenster und Tür */}
      <g fill="currentColor" stroke="none">
        <rect x="31.2" y="15" width="2.6" height="4" />
        <rect x="36.2" y="15" width="2.6" height="4" />
        <rect x="31.2" y="22" width="2.6" height="4" />
        <rect x="36.2" y="22" width="2.6" height="4" />
        <rect x="16.5" y="27" width="2.6" height="4" />
        <rect x="48.4" y="27" width="2.6" height="4" />
        <rect x="32.8" y="32" width="4.4" height="9" />
      </g>
      {/* Boden-Bogen */}
      <path d="M4 44.5C20 38.5 44 38.5 60 44.5" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  )
}

/** Bildmarke mit Wortmarke (Serifenschrift wie im Logo). */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-primary', className)}>
      <LogoMark className="h-8 shrink-0" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-serif text-[15px] font-semibold tracking-wide">SCHOPPMANN</span>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Zeiterfassung</span>
        </span>
      )}
    </span>
  )
}
