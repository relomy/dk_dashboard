import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProfiles } from '../../context/ProfileContext'
import { useLatest } from '../../hooks/useLatest'
import { useLiveModel } from '../../hooks/useLiveModel'
import { useShiftsFeed } from '../../hooks/useShiftsFeed'
import type { LiveModel } from '../../lib/liveModel'
import type { ShiftsFeed, AwaySummary } from '../../lib/shifts'
import { awayText, describeItem } from './shiftText'

/**
 * The banner under the top bar: one row per High item not yet surfaced, plus one "while you were away" line after a
 * long absence. Renders nothing without a feed (anyone but the owner, or outside the shell) or without a model for `sport`.
 */
function ShiftsBanner({ sport }: { sport: string | null }) {
  const feed = useShiftsFeed()
  return feed ? <ScopedBanner feed={feed} sport={sport} /> : null
}

function ScopedBanner({ feed, sport }: { feed: ShiftsFeed; sport: string | null }) {
  const { activeProfile } = useProfiles()
  const { snapshotQuery } = useLatest()
  const result = useLiveModel(snapshotQuery.data, sport?.toLowerCase())
  if (!sport || result?.kind !== 'ready') return null
  // Switching sport or Profile starts the banner over for that scope.
  return (
    <BannerRows
      key={`${result.model.sport}:${activeProfile.id}`}
      feed={feed}
      model={result.model}
      sport={sport}
      username={activeProfile.rules.username}
    />
  )
}

/**
 * Rows join the banner when their item turns up unsurfaced and stay until dismissed (or the feed is marked seen),
 * so surfacing one never blanks the others while they are being read. Surfacing is explicit: only Dismiss calls
 * `markSurfaced`, so an item never dismissed shows again on the next load.
 */
function BannerRows({ feed, model, sport, username }: { feed: ShiftsFeed; model: LiveModel; sport: string; username: string | undefined }) {
  const items = useSyncExternalStore(feed.subscribe, feed.feed)
  const away = useSyncExternalStore(feed.subscribe, feed.awaySummary)
  const [shownIds, setShownIds] = useState<string[]>([])
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [dismissedAway, setDismissedAway] = useState<AwaySummary | null>(null)

  const unsurfaced = items.filter((item) => item.priority === 'high' && !item.surfaced)
  const fresh = unsurfaced.filter((item) => !shownIds.includes(item.id))
  if (fresh.length > 0) setShownIds([...shownIds, ...fresh.map((item) => item.id)])
  const rows = shownIds.flatMap((id) => {
    const item = items.find((candidate) => candidate.id === id)
    return item && !dismissedIds.includes(id) ? [item] : []
  })
  const summary = away && away !== dismissedAway ? away : null
  if (rows.length === 0 && !summary) return null

  const shiftsPath = `/shifts/${sport}`
  return (
    <section aria-label="Shifts banner" className="border-b bg-card text-sm">
      <ul className="divide-y">
        {summary ? (
          <BannerRow
            lead={<Clock aria-hidden="true" className="size-4 text-muted-foreground" />}
            text={`While you were away (${awayText(summary.minutesAway)}): ${summary.unseenCount} unseen, top: ${describeItem(summary.topItem, model, username)}`}
            action={{ label: 'Open', to: shiftsPath }}
            onDismiss={() => setDismissedAway(summary)}
          />
        ) : null}
        {rows.map((item) => (
          <BannerRow
            key={item.id}
            lead={<Badge variant="destructive">High</Badge>}
            text={describeItem(item, model, username)}
            action={{ label: 'View', to: shiftsPath }}
            onDismiss={() => {
              setDismissedIds([...dismissedIds, item.id])
              feed.markSurfaced([item.id])
            }}
          />
        ))}
      </ul>
    </section>
  )
}

function BannerRow({
  lead,
  text,
  action,
  onDismiss,
}: {
  lead: ReactNode
  text: string
  action: { label: string; to: string }
  onDismiss: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
      {lead}
      <span className="min-w-0 flex-1 basis-48">{text}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button asChild variant="outline" size="sm">
          <Link to={action.to}>{action.label}</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </li>
  )
}

export default ShiftsBanner
