import { useSyncExternalStore } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { useShiftsFeed } from '../../hooks/useShiftsFeed'
import type { ShiftsFeed } from '../../lib/shifts'

/**
 * The top bar's way into the Shifts page for `sport`, carrying the unseen count as a quiet badge. Renders
 * nothing without a feed (anyone but the owner, or outside the shell) or without a sport to link to.
 */
function ShiftsEntry({ sport }: { sport: string | null }) {
  const feed = useShiftsFeed()
  if (!feed || !sport) return null
  return <ShiftsEntryLink feed={feed} sport={sport} />
}

function ShiftsEntryLink({ feed, sport }: { feed: ShiftsFeed; sport: string }) {
  const unseen = useSyncExternalStore(feed.subscribe, feed.unseenCount)
  const anyHigh = useSyncExternalStore(feed.subscribe, () => feed.feed().some((item) => item.priority === 'high'))
  return (
    <Link
      to={`/shifts/${sport}`}
      aria-label={`Shifts, ${unseen} unseen`}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground"
    >
      <Bell aria-hidden="true" className="size-4" />
      <span aria-hidden="true" className="hidden font-mono uppercase sm:inline">
        Shifts
      </span>
      {unseen > 0 ? (
        <Badge
          aria-hidden="true"
          data-testid="shifts-badge"
          data-tone={anyHigh ? 'red' : 'grey'}
          variant={anyHigh ? 'default' : 'secondary'}
          className={anyHigh ? 'bg-destructive text-background' : undefined}
        >
          {unseen}
        </Badge>
      ) : null}
    </Link>
  )
}

export default ShiftsEntry
