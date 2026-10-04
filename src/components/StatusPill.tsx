import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { statusLabel } from '../lib/sportStatus'
import type { SportStatus } from '../lib/types'

const tone: Record<SportStatus, { badge: string; dot: string }> = {
  ok: { badge: 'bg-cashing-muted text-cashing-foreground', dot: 'bg-cashing' },
  stale: { badge: 'bg-cash-line-muted text-cash-line', dot: 'bg-cash-line' },
  error: { badge: 'bg-non-cashing-muted text-non-cashing-foreground', dot: 'bg-non-cashing' },
}

/** A sport's data Status as a pill: fresh = cashing, stale = cash line, error = non-cashing. */
function StatusPill({ status, className }: { status: SportStatus; className?: string }) {
  return (
    <Badge className={cn('font-mono', tone[status].badge, className)}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', tone[status].dot)} />
      {statusLabel[status]}
    </Badge>
  )
}

export default StatusPill
