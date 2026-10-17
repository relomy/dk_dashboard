import { Fragment, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatPoints, formatRank, formatSigned } from '../../lib/format'
import type { LiveModel } from '../../lib/liveModel'
import type { ProfileMatchRules } from '../../lib/profiles'
import type { CashLineShiftItem, ContestShiftItem, Timeline, TimelineGap, TimelineStep } from '../../lib/shifts'
import { ALL_KINDS, filterTimeline, type FilteredItem } from '../../lib/timelineFilter'
import type { TimelineView } from '../../hooks/useTimelineView'
import type { LoadMoreState } from '../../hooks/useShiftsTimeline'
import type { TimelineRange } from '../../lib/timelineSource'
import { compactVipLine } from './compactText'
import { LineupDiff, MoveRow } from './ShiftCard'
import { contestStateText, describeItem, lineMoveText, PATH_TEXT, vipName } from './shiftText'

function clockOf(snapshotAt: string): string {
  const date = new Date(snapshotAt)
  return Number.isNaN(date.getTime()) ? snapshotAt : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** The "+N hidden" chip: reveals the parts of a row the filters hid. */
function HiddenToggle({ count, revealed, onToggle }: { count: number; revealed: boolean; onToggle: () => void }) {
  if (count === 0) return null
  return (
    <Button type="button" variant="outline" size="xs" aria-expanded={revealed} onClick={onToggle}>
      +{count} hidden
    </Button>
  )
}

/** The parts of a row to show: what the filters pass, plus what the user revealed, in kind order. */
function useRowParts({ shown, hidden }: FilteredItem) {
  const [revealed, setRevealed] = useState(false)
  const parts = revealed ? ALL_KINDS.filter((kind) => shown.includes(kind) || hidden.includes(kind)) : shown
  return { parts, toggleChip: <HiddenToggle count={hidden.length} revealed={revealed} onToggle={() => setRevealed((value) => !value)} /> }
}

function VipRow({ row, name, filtered }: { row: FilteredItem; name: string; filtered: boolean }) {
  const { item, shown } = row
  const { parts, toggleChip } = useRowParts(row)
  if (item.kind !== 'vip') return null
  const crossingCause = item.crossing?.cause ? lineMoveText(item.crossing.cause) : ''
  const showLineup = parts.includes('player-events') || (!filtered && !item.parts?.includes('player-events') && shown.length > 0)
  return (
    <section aria-label={name} className="space-y-1 border-t border-border px-3 py-2 first:border-t-0">
      <h3 className="flex items-center gap-2 font-semibold">
        {name}
        {item.priority === 'high' ? <Badge variant="destructive">High</Badge> : null}
      </h3>
      {parts.includes('crossings') && item.crossing ? <p>{PATH_TEXT[item.crossing.path]}</p> : null}
      {parts.includes('crossings') && crossingCause ? <p className="text-muted-foreground">The cash line moved {crossingCause}. Their lineup did not cause this.</p> : null}
      {parts.includes('rank-points') ? (
        <>
          <MoveRow label="Rank" move={item.rank} format={formatRank} lowerIsBetter places />
          <MoveRow label="Points" move={item.points} format={formatPoints} />
          <MoveRow label="To cash" move={item.distanceToCashPoints} format={formatSigned} />
        </>
      ) : null}
      {showLineup && item.lineup && item.lineup.length > 0 ? <LineupDiff lineup={item.lineup} /> : null}
      {toggleChip}
    </section>
  )
}

function CashLineRow({ item }: { item: CashLineShiftItem }) {
  return <p className="bg-cash-line-muted px-3 py-2 text-cash-line">The cash line moved {lineMoveText(item)}</p>
}

function ContestRow({ item, model, selected, username }: { item: ContestShiftItem; model: LiveModel; selected: ReadonlySet<string>; username: string | undefined }) {
  const standings = (item.standings ?? []).filter((standing) => selected.has(standing.vipKey))
  return (
    <div className="space-y-1 border-t border-border px-3 py-2 first:border-t-0">
      <p className="flex items-center gap-2 font-semibold">
        {contestStateText(item.state.to)}
        {item.priority === 'high' ? <Badge variant="destructive">High</Badge> : null}
      </p>
      {standings.length > 0 ? (
        <ul className="space-y-0.5">
          {standings.map((standing) => (
            <li key={standing.vipKey} className="flex justify-between gap-2">
              <span>{vipName(model, standing.vipKey, username)}</span>
              <span className="font-mono tabular-nums">
                {formatRank(standing.rank.to)} · {formatPoints(standing.points.to)} · {standing.cashing ? 'Cashing' : 'Not cashing'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Compact: one short line per change, with the row's "+N hidden" chip after its last line. */
function CompactItem({ row, model, username }: { row: FilteredItem; model: LiveModel; username: string | undefined }) {
  const { item } = row
  const { parts, toggleChip } = useRowParts(row)
  const lines: string[] =
    item.kind === 'vip'
      ? parts.flatMap((part) => compactVipLine(item, part, vipName(model, item.vipKey, username)) ?? [])
      : [describeItem(item, model, username)]
  return (
    <>
      {lines.map((line, index) => (
        <li key={index} className="px-3 py-1">
          {line}
        </li>
      ))}
      {row.hidden.length > 0 ? <li className="px-3 py-1">{toggleChip}</li> : null}
    </>
  )
}

function StepCard({ step, rows, model, selected, username, compact, filtered }: { step: TimelineStep; rows: FilteredItem[]; model: LiveModel; selected: ReadonlySet<string>; username: string | undefined; compact: boolean; filtered: boolean }) {
  return (
    <article aria-label={`Step at ${clockOf(step.snapshotAt)}`} className="min-w-0">
      <Card size="sm" className="gap-0 py-0">
        <header className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          <time dateTime={step.snapshotAt}>{clockOf(step.snapshotAt)}</time>
        </header>
        {compact ? (
          <ul aria-label="Changes" className="divide-y divide-border">
            {rows.map((row) => (
              <CompactItem key={row.item.id} row={row} model={model} username={username} />
            ))}
          </ul>
        ) : (
          rows.map((row) => {
            const { item } = row
            switch (item.kind) {
              case 'vip':
                return <VipRow key={item.id} row={row} name={vipName(model, item.vipKey, username)} filtered={filtered} />
              case 'cash-line':
                return <CashLineRow key={item.id} item={item} />
              case 'contest-state':
                return <ContestRow key={item.id} item={item} model={model} selected={selected} username={username} />
            }
          })
        )}
      </Card>
    </article>
  )
}

/** A dashed rail node where a snapshot was skipped; only a failure offers a retry. */
function GapNode({ gap, onRetry }: { gap: TimelineGap; onRetry?: (snapshotAt: string) => Promise<void> | void }) {
  const [retrying, setRetrying] = useState(false)
  const label = gap.reason === 'unavailable' ? 'Snapshot unavailable' : 'Not fresh'
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry?.(gap.snapshotAt)
    } finally {
      setRetrying(false)
    }
  }
  return (
    <div role="group" aria-label={`${label} at ${clockOf(gap.snapshotAt)}`} className="space-y-1 rounded-xl border border-dashed border-border px-3 py-2 text-muted-foreground">
      <p className="font-medium">{label}</p>
      <p className="text-xs">Shifts inside it may be lost; the Steps either side are compared across it.</p>
      {gap.reason === 'unavailable' && onRetry ? (
        <Button variant="outline" size="sm" disabled={retrying} onClick={() => void retry()}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

/** A rail row: the dot on the rail, then the node itself. */
function RailRow({ children, dashed = false, arrived = false }: { children: React.ReactNode; dashed?: boolean; arrived?: boolean }) {
  return (
    <li className={cn('grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2', arrived && 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2')}>
      <div className="relative" aria-hidden="true">
        <span className="absolute inset-y-0 left-[7px] border-l-2 border-border" />
        <span className={cn('absolute left-[2px] top-3.5 size-3 rounded-full border-2 border-muted-foreground bg-background', dashed && 'border-dashed')} />
      </div>
      <div className="py-1.5">{children}</div>
    </li>
  )
}

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
function useArrivals(timeline: Timeline): Arrivals {
  const steps = timeline.entries.filter((entry): entry is TimelineStep => entry.kind === 'step')
  const newestAt = steps[0]?.snapshotAt ?? null
  const [arrivals, setArrivals] = useState<Arrivals>({ newestAt, ids: new Set(), announcement: '' })
  if (newestAt !== arrivals.newestAt) {
    const fresh = steps.filter((step) => arrivals.newestAt === null || step.snapshotAt > arrivals.newestAt)
    setArrivals({
      newestAt: arrivals.newestAt !== null && newestAt !== null && newestAt < arrivals.newestAt ? arrivals.newestAt : newestAt,
      ids: new Set([...arrivals.ids, ...fresh.map((step) => step.id)]),
      announcement: fresh.length > 0 ? `${fresh.length} new ${fresh.length === 1 ? 'Step' : 'Steps'}` : '',
    })
  }
  return arrivals
}

/** The Seen mark's divider: a line across the rail, labelled with the Seen mark's snapshot time. */
function SeenMark({ seenAt }: { seenAt: string }) {
  return (
    <li role="separator" aria-label={`Seen mark at ${clockOf(seenAt)}`} className="flex items-center gap-2 py-1 font-mono text-xs text-muted-foreground">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span aria-hidden="true">Seen {clockOf(seenAt)}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </li>
  )
}

/** The oldest snapshot time the rail reaches, whether a step, a gap or the range note's digest. */
function rangeFloor(timeline: Timeline): number | null {
  const times = [...timeline.entries.map((entry) => entry.snapshotAt), ...(timeline.rangeNote ? [timeline.rangeNote.snapshotAt] : [])].map((at) => Date.parse(at))
  return times.length > 0 ? Math.min(...times) : null
}

/** The sticky header: snapshots loaded out of the cap, which also shows the progress of a Load more. */
function RangeMeter({ range, more }: { range: TimelineRange; more: LoadMoreState }) {
  const text = `${range.loaded} of ${range.cap} snapshots`
  return (
    <div className="sticky top-0 z-10 -mx-1 space-y-1 bg-background/95 px-1 py-2 backdrop-blur">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{text}</span>
        {more.busy ? <span>{more.progress ? `Loading ${more.progress.done} of ${more.progress.total}...` : 'Loading...'}</span> : null}
      </div>
      <div
        role="progressbar"
        aria-label="Snapshots loaded"
        aria-valuemin={0}
        aria-valuemax={range.cap}
        aria-valuenow={range.loaded}
        aria-valuetext={text}
        aria-busy={more.busy}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn('h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none', more.busy && 'animate-pulse motion-reduce:animate-none')} style={{ width: `${Math.min(100, (range.loaded / range.cap) * 100)}%` }} />
      </div>
    </div>
  )
}

/** Why loading stopped, at the rail's tail. */
function rangeNoteText(range: TimelineRange, rangeNote: Timeline['rangeNote']): string | null {
  if (!range.reach || !rangeNote) return null
  const at = clockOf(rangeNote.snapshotAt)
  if (range.reach === 'contest-start') return `Contest start: the first snapshot is at ${at}.`
  if (range.reach === 'cap') return `Stopped at the cap of ${range.cap} snapshots. Older Steps are not loaded.`
  return `From ${at}. The loaded history ends here.`
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
  more = { busy: false, progress: null, error: null, announcement: '' },
}: {
  timeline: Timeline
  model: LiveModel
  rules: ProfileMatchRules
  view: TimelineView
  /** Refetches a failed snapshot; a gap offers its retry only when this is given. */
  onRetryGap?: (snapshotAt: string) => Promise<void> | void
  /** The Seen mark's snapshot time: the divider sits above the first row at or before it, or at the tail note when the mark lies before the rail. */
  seenAt: string | null
  /** How much is loaded and why loading stopped; without it the rail has no meter and no Range note. */
  range?: TimelineRange
  /** Loads further back; the Load more node shows only when this is given. */
  onLoadMore?: () => Promise<void> | void
  more?: LoadMoreState
}) {
  const { filters, compact } = view
  const arrivals = useArrivals(timeline)
  const username = rules.username
  const noteRef = useRef<HTMLParagraphElement>(null)
  const hadLoadMore = useRef(false)
  useEffect(() => {
    // The Load more button leaves the page when loading stops; keep keyboard focus by moving it to the note.
    if (hadLoadMore.current && !onLoadMore) noteRef.current?.focus()
    hadLoadMore.current = Boolean(onLoadMore)
  }, [onLoadMore])
  const rows = filterTimeline(timeline.entries, filters)
  const noteText = range ? rangeNoteText(range, timeline.rangeNote) : null
  const hasSteps = rows.some((row) => row.kind === 'step')
  const updates = (
    <div role="status" aria-label="Timeline updates" aria-live="polite" className="sr-only">
      {arrivals.announcement}
    </div>
  )
  const loadMoreAnnouncement = (
    <div role="status" aria-label="Loading more" aria-live="polite" className="sr-only">
      {more.announcement}
    </div>
  )
  const filtered = filters.kinds.size < ALL_KINDS.length || filters.highOnly
  const seenMs = seenAt === null ? null : Date.parse(seenAt)
  const floor = rangeFloor(timeline)
  const beyondRange = seenMs !== null && floor !== null && seenMs < floor
  const firstSeen = rows.findIndex((entry) => seenMs !== null && Date.parse(entry.kind === 'gap' ? entry.snapshotAt : entry.step.snapshotAt) <= seenMs)
  const dividerAt = !hasSteps || seenAt === null || beyondRange ? -1 : firstSeen === -1 ? rows.length : firstSeen
  const divider = seenAt === null ? null : <SeenMark seenAt={seenAt} />
  const filteredOut = !view.isDefault && timeline.entries.some((entry) => entry.kind === 'step')
  return (
    <div className="space-y-2">
      {range ? <RangeMeter range={range} more={more} /> : null}
      {updates}
      {loadMoreAnnouncement}
      {hasSteps ? (
        <ol aria-label="Timeline" className="flex flex-col">
          {rows.map((entry, index) => (
            <Fragment key={entry.kind === 'gap' ? entry.id : entry.step.id}>
              {index === dividerAt ? divider : null}
              {entry.kind === 'gap' ? (
                <RailRow dashed>
                  <GapNode gap={entry} onRetry={onRetryGap} />
                </RailRow>
              ) : (
                <RailRow arrived={arrivals.ids.has(entry.step.id)}>
                  <StepCard step={entry.step} rows={entry.items} model={model} selected={filters.vips} username={username} compact={compact} filtered={filtered} />
                </RailRow>
              )}
            </Fragment>
          ))}
          {dividerAt === rows.length ? divider : null}
          {onLoadMore ? (
            <RailRow dashed>
              <LoadMoreNode busy={more.busy} error={more.error} onLoadMore={onLoadMore} />
            </RailRow>
          ) : null}
        </ol>
      ) : (
        <>
          {filteredOut ? (
            <div className="space-y-2 py-8 text-center text-sm text-muted-foreground">
              <p>No entries match these filters</p>
              <Button variant="outline" size="sm" onClick={view.reset}>
                Reset
              </Button>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No VIP shifts yet</p>
          )}
          {onLoadMore ? <LoadMoreNode busy={more.busy} error={more.error} onLoadMore={onLoadMore} /> : null}
        </>
      )}
      {noteText ? (
        <p ref={noteRef} tabIndex={-1} className="text-center text-xs text-muted-foreground outline-none">
          {noteText}
        </p>
      ) : null}
      {beyondRange ? <p className="text-center text-xs text-muted-foreground">Unseen shifts exist further back than this Timeline reaches.</p> : null}
    </div>
  )
}

/** The rail's "Load more" node; while loading it stays in place, marked busy and inert so focus is not lost. */
function LoadMoreNode({ busy, error, onLoadMore }: { busy: boolean; error: string | null; onLoadMore: () => Promise<void> | void }) {
  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        aria-busy={busy}
        aria-disabled={busy}
        onClick={() => {
          if (!busy) void onLoadMore()
        }}
      >
        {busy ? 'Loading more...' : 'Load more'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not load more: {error}
        </p>
      ) : null}
    </div>
  )
}
