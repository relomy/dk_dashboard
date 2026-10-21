import { Fragment, useEffect, useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { LiveModel } from '../../lib/liveModel'
import type { ProfileMatchRules } from '../../lib/profiles'
import type { Timeline, TimelineStep } from '../../lib/shifts'
import { ALL_KINDS, filterTimeline, type FilteredEntry } from '../../lib/timelineFilter'
import type { TimelineView } from '../../hooks/useTimelineView'
import type { LoadMoreState } from '../../hooks/useShiftsTimeline'
import type { TimelineRange } from '../../lib/timelineSource'
import { GapNode, LoadMoreNode, RailRow, RangeMeter, SeenMark, type RetryOutcome } from './RailNodes'
import { StepCard } from './StepCard'
import { clockOf, rangeFloor, rangeNoteText, stampOf } from './timelineText'

export type { RetryOutcome } from './RailNodes'

interface Arrivals {
  /** The newest Step's time when last seen; Steps after it are arrivals. */
  newestAt: string | null
  /** The ids of Steps that arrived while the rail was open. */
  ids: Set<string>
  /** What the live region says; empty until something arrives. */
  announcement: string
}

/**
 * Tracks the Steps that arrive on top while the rail is open, so they can be announced and animated. Steps the rail
 * opened with, and older ones that "Load more" adds, are not arrivals.
 */
function useArrivals(timeline: Timeline, visible: FilteredEntry[]): Arrivals {
  const steps = timeline.entries.filter((entry): entry is TimelineStep => entry.kind === 'step')
  const newestAt = steps[0]?.snapshotAt ?? null
  const [arrivals, setArrivals] = useState<Arrivals>({ newestAt, ids: new Set(), announcement: '' })
  if (newestAt !== arrivals.newestAt) {
    const fresh = steps.filter((step) => arrivals.newestAt === null || step.snapshotAt > arrivals.newestAt)
    const shown = new Set(visible.flatMap((entry) => (entry.kind === 'step' ? [entry.step.id] : [])))
    const seen = fresh.filter((step) => shown.has(step.id))
    const newest = seen[0] ? clockOf(seen[0].snapshotAt) : ''
    setArrivals({
      newestAt:
        arrivals.newestAt !== null && newestAt !== null && newestAt < arrivals.newestAt ? arrivals.newestAt : newestAt,
      ids: new Set([...arrivals.ids, ...fresh.map((step) => step.id)]),
      // Naming the time makes every arrival a new message, so repeats are announced too.
      announcement:
        seen.length === 0
          ? ''
          : seen.length === 1
            ? `New Step at ${newest}`
            : `${seen.length} new Steps, newest ${newest}`,
    })
  }
  return arrivals
}

/** The step rail: one card per Step, newest first, filtered by the view's filters and condensed under Compact. */
export function TimelineRail({
  timeline,
  model,
  rules,
  view,
  onRetryGap,
  seenAt,
  range,
  onLoadMore,
  more,
  refreshError = null,
}: {
  timeline: Timeline
  model: LiveModel
  rules: ProfileMatchRules
  view: TimelineView
  /** Refetches a failed snapshot; resolves `{ ok: false }` when it still could not be fetched. */
  onRetryGap: (snapshotAt: string) => Promise<RetryOutcome> | RetryOutcome
  /** The Seen mark's snapshot time: the divider sits above the first row at or before it, or at the tail note when the mark lies before the rail. */
  seenAt: string | null
  /** How much is loaded and why loading stopped. */
  range: TimelineRange
  /** Loads further back; undefined once there is nothing further to load. */
  onLoadMore: (() => Promise<void> | void) | undefined
  more: LoadMoreState
  /** Set when the last background refresh failed; the rail stays as it is and says so. */
  refreshError?: Error | null
}) {
  const { filters, compact } = view
  const rows = filterTimeline(timeline.entries, filters)
  const arrivals = useArrivals(timeline, rows)
  const username = rules.username
  const noteRef = useRef<HTMLParagraphElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const hadLoadMore = useRef(false)
  const ownLoad = useRef(false)
  useEffect(() => {
    // The Load more button leaves the page when loading stops. Keep keyboard focus by moving it to the note, but only
    // when the user's own Load more ended it: a background poll that reaches the cap must not steal focus.
    if (hadLoadMore.current && !onLoadMore && ownLoad.current) noteRef.current?.focus()
    if (!onLoadMore) ownLoad.current = false
    hadLoadMore.current = Boolean(onLoadMore)
  }, [onLoadMore])
  useEffect(() => {
    if (!more.busy && onLoadMore) ownLoad.current = false
  }, [more.busy, onLoadMore])
  // After a successful retry the gap's button is gone; focus goes to the Step that replaced it, else to the rail.
  const retriedRef = useRef<string | null>(null)
  const [retriedTick, noteRetried] = useReducer((tick: number) => tick + 1, 0)
  useEffect(() => {
    const retried = retriedRef.current
    if (retried === null) return
    if (rows.some((row) => row.kind === 'gap' && row.snapshotAt === retried)) return
    const active = document.activeElement
    if (!active || active === document.body) {
      const step = [...(listRef.current?.querySelectorAll<HTMLElement>('article[data-snapshot-at]') ?? [])].find(
        (node) => node.dataset.snapshotAt === retried,
      )
      ;(step ?? listRef.current)?.focus()
    }
    retriedRef.current = null
  }, [retriedTick, rows])
  const noteText = rangeNoteText(range, timeline.rangeNote)
  const hasSteps = rows.some((row) => row.kind === 'step')
  const updates = (
    <div role="status" aria-label="Timeline updates" aria-live="polite" className="sr-only">
      {arrivals.announcement}
    </div>
  )
  const loadMoreAnnouncement = (
    <div role="status" aria-label="Loading more" aria-live="polite" className="sr-only">
      {/* A failure is announced by the alert on the Load more node; saying it here too would read it twice. */}
      {more.error ? '' : more.announcement}
    </div>
  )
  const filtered = filters.kinds.size < ALL_KINDS.length || filters.highOnly
  const seenMs = seenAt === null ? null : Date.parse(seenAt)
  const floor = rangeFloor(timeline)
  const beyondRange = seenMs !== null && floor !== null && seenMs < floor
  const firstSeen = rows.findIndex(
    (entry) => seenMs !== null && Date.parse(entry.kind === 'gap' ? entry.snapshotAt : entry.step.snapshotAt) <= seenMs,
  )
  const dividerAt = !hasSteps || seenAt === null || beyondRange ? -1 : firstSeen === -1 ? rows.length : firstSeen
  const seenStamp = seenAt === null ? '' : stampOf(seenAt, timeline.entries[0]?.snapshotAt ?? null)
  const divider = seenAt === null ? null : <SeenMark stamp={seenStamp} />
  // Steps exist but the filters hide them all; with none at all there is simply nothing yet.
  const hasHiddenSteps = !hasSteps && timeline.entries.some((entry) => entry.kind === 'step' && entry.items.length > 0)
  const startLoadMore = () => {
    ownLoad.current = true
    return onLoadMore?.()
  }
  return (
    <div className="space-y-2">
      <RangeMeter range={range} more={more} />
      {refreshError ? (
        <p role="status" className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          Could not refresh the Timeline. What is loaded stays as it was; it will try again.
        </p>
      ) : null}
      {updates}
      {loadMoreAnnouncement}
      {hasSteps ? null : (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <p>
            {hasHiddenSteps
              ? view.isDefault
                ? "No shifts for your Profile's VIPs"
                : 'No entries match these filters'
              : 'No VIP shifts yet'}
          </p>
          {hasHiddenSteps && !view.isDefault ? (
            <Button type="button" variant="outline" size="sm" onClick={view.reset}>
              Reset
            </Button>
          ) : null}
        </div>
      )}
      {rows.length > 0 ? (
        <ol ref={listRef} tabIndex={-1} aria-label="Timeline" className="flex flex-col outline-none">
          {rows.map((entry, index) => (
            <Fragment key={entry.kind === 'gap' ? entry.id : entry.step.id}>
              {index === dividerAt ? divider : null}
              {entry.kind === 'gap' ? (
                <RailRow dashed>
                  <GapNode
                    gap={entry}
                    onRetry={onRetryGap}
                    onRetried={(at) => {
                      retriedRef.current = at
                      noteRetried()
                    }}
                  />
                </RailRow>
              ) : (
                <RailRow arrived={arrivals.ids.has(entry.step.id)}>
                  <StepCard
                    step={entry.step}
                    rows={entry.items}
                    model={model}
                    followed={view.followed}
                    username={username}
                    compact={compact}
                    filtered={filtered}
                  />
                </RailRow>
              )}
            </Fragment>
          ))}
          {dividerAt === rows.length ? divider : null}
          {onLoadMore ? (
            <RailRow dashed>
              <LoadMoreNode busy={more.busy} error={more.error} onLoadMore={startLoadMore} />
            </RailRow>
          ) : null}
        </ol>
      ) : onLoadMore ? (
        <LoadMoreNode busy={more.busy} error={more.error} onLoadMore={startLoadMore} />
      ) : null}
      {noteText ? (
        <p ref={noteRef} tabIndex={-1} className="text-center text-xs text-muted-foreground outline-none">
          {noteText}
        </p>
      ) : null}
      {beyondRange && seenAt ? (
        <p className="text-center text-xs text-muted-foreground">You last looked at {seenStamp}, earlier than shown</p>
      ) : null}
    </div>
  )
}
