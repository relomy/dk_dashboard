import { useSyncExternalStore } from 'react'
import { Outlet, useMatch, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Tabs } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { CashLineShiftCard, ContestShiftCard, VipShiftCard } from '../components/shifts/ShiftCard'
import { vipName } from '../components/shifts/shiftText'
import PageMessage from '../components/PageMessage'
import { TimelineRail } from '../components/shifts/TimelineRail'
import { useProfiles } from '../context/ProfileContext'
import { useLatest } from '../hooks/useLatest'
import { useLiveModel } from '../hooks/useLiveModel'
import { useShiftsFeed } from '../hooks/useShiftsFeed'
import { useShiftsTimeline } from '../hooks/useShiftsTimeline'
import { useTimelineView, type TimelineView } from '../hooks/useTimelineView'
import { TimelineFilterBar } from '../components/shifts/TimelineFilterBar'
import type { LiveModel } from '../lib/liveModel'
import type { ShiftsFeed } from '../lib/shifts'

interface ShiftsOutletContext {
  feed: ShiftsFeed
  model: LiveModel
  /** Filters and Compact, held above the tabs so they survive switching between them. */
  view: TimelineView
}

/** The "since you looked" Summary, the child route at a sport's address. */
export function ShiftsSummary() {
  const { feed, model } = useOutletContext<ShiftsOutletContext>()
  const items = useSyncExternalStore(feed.subscribe, feed.feed)
  const autoAdvanced = useSyncExternalStore(feed.subscribe, feed.autoAdvanced)
  const { activeProfile } = useProfiles()
  const username = activeProfile.rules.username
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" disabled={items.length === 0} onClick={() => feed.markSeen()}>
          Mark as seen
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="space-y-1 py-8 text-center text-sm text-muted-foreground">
          <p>Nothing has moved since you last looked.</p>
          {autoAdvanced ? <p>Moved on by itself because you were only away briefly.</p> : null}
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

/**
 * The Timeline, the child route at `timeline`. It mounts only when the route is visited, so nothing is loaded
 * before then. Rows are the active Profile's VIPs.
 */
export function ShiftsTimeline() {
  const { feed, model, view } = useOutletContext<ShiftsOutletContext>()
  const { activeProfile } = useProfiles()
  const seenAt = useSyncExternalStore(feed.subscribe, feed.seenSnapshotAt)
  const { opening, error, loading, progress, retry, retryGap, loadMore, more, refreshError } = useShiftsTimeline(
    model.sport,
  )
  if (error) {
    return (
      <PageMessage tone="error">
        <p>{error instanceof Error ? error.message : 'The Timeline could not be loaded.'}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      </PageMessage>
    )
  }
  if (opening?.kind === 'not-renderable')
    return <PageMessage>There is nothing to follow live for this sport.</PageMessage>
  const ready = !loading && opening !== undefined
  return (
    <div className="space-y-3">
      {/* One live region for the whole load: it says when loading starts and when it is done, not every progress tick. */}
      <div role="status" aria-live="polite" className="sr-only">
        {ready ? 'Timeline loaded' : 'Loading the Timeline...'}
      </div>
      {ready ? (
        <>
          <TimelineFilterBar view={view} model={model} username={activeProfile.rules.username} />
          <TimelineRail
            timeline={opening.timeline}
            model={model}
            rules={activeProfile.rules}
            view={view}
            onRetryGap={retryGap}
            seenAt={seenAt}
            range={opening.range}
            onLoadMore={opening.loadMore ? loadMore : undefined}
            more={more}
            refreshError={refreshError}
          />
        </>
      ) : (
        <p aria-hidden="true" className="py-8 text-center text-sm text-muted-foreground">
          {progress ? `Loading... ${progress.done} of ${progress.total} snapshots` : 'Loading...'}
        </p>
      )}
    </div>
  )
}

const TAB_CLASS =
  'rounded-md px-2 py-1 font-mono text-xs uppercase text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=active]:bg-secondary data-[state=active]:text-foreground'

/** The page shell: the heading and tab strip above the nested tab routes, which share the feed and model. */
function ShiftsPage({ sport, feed, model }: { sport: string | undefined; feed: ShiftsFeed; model: LiveModel }) {
  const tab = useMatch('/shifts/:sport/timeline') ? 'timeline' : 'summary'
  const navigate = useNavigate()
  const { activeProfile } = useProfiles()
  const view = useTimelineView(model, activeProfile.rules)
  // The route owns the selected tab: arrow keys, Space, Enter and clicks all end in a navigation.
  const show = (value: string) => {
    if (value !== tab) navigate(value === 'timeline' ? `/shifts/${sport}/timeline` : `/shifts/${sport}`)
  }
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h1 className="text-lg font-semibold">Shifts</h1>
      <Tabs.Root value={tab} onValueChange={show}>
        <Tabs.List className="flex items-center gap-1">
          <Tabs.Trigger value="summary" onClick={() => show('summary')} className={TAB_CLASS}>
            Summary
          </Tabs.Trigger>
          <Tabs.Trigger value="timeline" onClick={() => show('timeline')} className={TAB_CLASS}>
            Timeline
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value={tab}>
          <Outlet context={{ feed, model, view } satisfies ShiftsOutletContext} />
        </Tabs.Content>
      </Tabs.Root>
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
  if (!feed || !result) return <PageMessage>Loading shifts...</PageMessage>
  if (result.kind === 'not-renderable')
    return <PageMessage>There is nothing to follow live for this sport.</PageMessage>
  return <ShiftsPage sport={sport} feed={feed} model={result.model} />
}

export default Shifts
