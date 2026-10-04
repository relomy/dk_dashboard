import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { statusLabel, statusTone } from '../lib/sportStatus'
import type { SportStatus } from '../lib/types'

/** A sport's data Status as a pill: fresh = cashing, stale = cash line, error = non-cashing. */
function StatusPill({ status, className }: { status: SportStatus; className?: string }) {
  return (
    <Badge className={cn('font-mono', statusTone[status].badge, className)}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', statusTone[status].dot)} />
      {statusLabel[status]}
    </Badge>
  )
}

export default StatusPill
