import { useSyncExternalStore } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { CashLineShiftCard, ContestShiftCard, VipShiftCard } from '../components/shifts/ShiftCard'
import PageMessage from '../components/PageMessage'
import { useProfiles } from '../context/ProfileContext'
import { useLatest } from '../hooks/useLatest'
import { useLiveModel } from '../hooks/useLiveModel'
import { useShiftsFeed } from '../hooks/useShiftsFeed'
import type { LiveModel } from '../lib/liveModel'
import type { ShiftsFeed } from '../lib/shifts'

/**
 * "You" only for the VIP the active Profile's `username` rule matches (an exact match on the lineup's display
 * name, as the Profile matcher does); every other VIP is shown by name.
 */
function vipName(model: LiveModel, vipKey: string, username: string | undefined): string {
  const name = model.vips.find((vip) => vip.key === vipKey)?.name ?? 'VIP'
  const rule = (username ?? '').trim().toLowerCase()
  return rule && name.trim().toLowerCase() === rule ? 'You' : name
}

function ShiftsFeedView({ feed, model }: { feed: ShiftsFeed; model: LiveModel }) {
  const items = useSyncExternalStore(feed.subscribe, feed.feed)
  const autoAdvanced = useSyncExternalStore(feed.subscribe, feed.autoAdvanced)
  const { activeProfile } = useProfiles()
  const username = activeProfile.rules.username
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Shifts</h1>
        <Button variant="outline" size="sm" disabled={items.length === 0} onClick={() => feed.markSeen()}>
          Mark as seen
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="space-y-1 py-8 text-center text-sm text-muted-foreground">
          <p>Nothing has moved since you last looked.</p>
          {autoAdvanced ? <p>The Seen mark moved on by itself because you were only away briefly.</p> : null}
        </div>
      ) : null}
      {items.map((item) => {
        switch (item.kind) {
          case 'vip':
            return <VipShiftCard key={item.id} item={item} name={vipName(model, item.vipKey, username)} />
          case 'cash-line':
            return <CashLineShiftCard key={item.id} item={item} />
          case 'contest-state':
            return <ContestShiftCard key={item.id} item={item} />
        }
      })}
    </div>
  )
}

function Shifts() {
  const { sport } = useParams()
  const feed = useShiftsFeed()
  const { snapshotQuery } = useLatest()
  const result = useLiveModel(snapshotQuery.data, sport?.toLowerCase())

  if (snapshotQuery.error instanceof Error && !snapshotQuery.data) {
    return (
      <PageMessage tone="error">
        <p>{snapshotQuery.error.message}</p>
      </PageMessage>
    )
  }
  if (!feed) return <PageMessage>Shifts are not available.</PageMessage>
  if (!result) return <PageMessage>Loading shifts...</PageMessage>
  if (result.kind === 'not-renderable') return <PageMessage>There is nothing to follow live for this sport.</PageMessage>
  return <ShiftsFeedView feed={feed} model={result.model} />
}

export default Shifts
