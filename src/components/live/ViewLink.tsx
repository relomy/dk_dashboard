import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

const VARIANT = {
  /** A row in the tablet and desktop rail. */
  rail: {
    base: 'flex items-center gap-2 rounded-lg px-2 py-2 text-left',
    active: 'bg-accent ring-1 ring-border',
    idle: 'hover:bg-card',
  },
  /** A pill in the phone's chip row. */
  chip: {
    base: 'flex shrink-0 items-center gap-1.5 rounded-full border py-1 text-xs',
    active: 'border-ring bg-accent text-foreground',
    idle: 'text-muted-foreground',
  },
} as const

/**
 * A link to a Live view or focus (a rail row or a phone chip), marked as the current page
 * when it is the one showing.
 */
function ViewLink({
  search,
  active,
  variant,
  className,
  children,
}: {
  /** The `search` the link goes to. */
  search: string
  active: boolean
  variant: keyof typeof VARIANT
  className?: string
  children: ReactNode
}) {
  const style = VARIANT[variant]
  return (
    <Link
      to={{ search }}
      aria-current={active ? 'page' : undefined}
      className={cn(style.base, active ? style.active : style.idle, className)}
    >
      {children}
    </Link>
  )
}

export default ViewLink
