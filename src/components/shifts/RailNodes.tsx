import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LoadMoreState } from '../../hooks/useShiftsTimeline'
import type { GapReason, TimelineGapEntry } from '../../lib/shifts'
import type { TimelineRange } from '../../lib/timelineSource'
import { clockOf } from './timelineText'

/** What a retry resolves with; `ok: false` means the snapshot still could not be fetched. */
export type RetryOutcome = { ok: boolean } | void

const GAP_LABELS: Record<GapReason, string> = {
  unavailable: 'Snapshot unavailable',
  'not-fresh': 'Not fresh',
  'not-renderable': "Snapshot can't be shown",
}

/** A dashed rail node where a snapshot was skipped; only a failure offers a retry, and a failed retry says so. */
export function GapNode({
  gap,
  onRetry,
  onRetried,
}: {
  gap: TimelineGapEntry
  onRetry: (snapshotAt: string) => Promise<RetryOutcome> | RetryOutcome
  onRetried: (snapshotAt: string) => void
}) {
  const [retrying, setRetrying] = useState(false)
  const [failed, setFailed] = useState(false)
  // Only a failed fetch offers a retry; a snapshot that is not fresh or not renderable would fail the same way.
  const label = GAP_LABELS[gap.reason]
  const retriable = gap.reason === 'unavailable'
  const retry = async () => {
    if (retrying) return
    setRetrying(true)
    setFailed(false)
    try {
      const outcome = await onRetry(gap.snapshotAt)
      if (outcome && outcome.ok === false) setFailed(true)
      else onRetried(gap.snapshotAt)
    } catch {
      setFailed(true)
    } finally {
      setRetrying(false)
    }
  }
  return (
    <div
      role="group"
      aria-label={`${label} at ${clockOf(gap.snapshotAt)}`}
      className="space-y-1 rounded-xl border border-dashed border-border px-3 py-2 text-muted-foreground"
    >
      <p className="font-medium">{label}</p>
      <p className="text-xs">Shifts inside it may be lost; the Steps either side are compared across it.</p>
      {retriable ? (
        <>
          <Button variant="outline" size="sm" aria-disabled={retrying} onClick={() => void retry()}>
            Retry
          </Button>
          <p role="status" aria-live="polite" className="text-xs text-destructive">
            {failed ? 'Retry failed. The snapshot is still unavailable; try again.' : ''}
          </p>
        </>
      ) : null}
    </div>
  )
}

/** A rail row: the dot on the rail, then the node itself. */
export function RailRow({
  children,
  dashed = false,
  arrived = false,
}: {
  children: React.ReactNode
  dashed?: boolean
  arrived?: boolean
}) {
  return (
    <li
      className={cn(
        'grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2',
        arrived && 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2',
      )}
    >
      <div className="relative" aria-hidden="true">
        <span className="absolute inset-y-0 left-[7px] border-l-2 border-border" />
        <span
          className={cn(
            'absolute left-[2px] top-3.5 size-3 rounded-full border-2 border-muted-foreground bg-background',
            dashed && 'border-dashed',
          )}
        />
      </div>
      <div className="py-1.5">{children}</div>
    </li>
  )
}

/** The Seen mark's divider: a labelled line across the rail. It sits in a presentational item so the list keeps only Steps and nodes. */
export function SeenMark({ stamp }: { stamp: string }) {
  return (
    <li role="presentation" className="flex items-center gap-2 py-1 font-mono text-xs text-muted-foreground">
      <hr aria-label={`You last looked at ${stamp}`} className="m-0 h-px flex-1 border-0 bg-border" />
      <span aria-hidden="true">Last looked · {stamp}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </li>
  )
}

/** The sticky header: snapshots loaded out of the cap, which also shows the progress of a Load more. */
export function RangeMeter({ range, more }: { range: TimelineRange; more: LoadMoreState }) {
  const text = `${range.loaded} of ${range.cap} snapshots`
  return (
    <div className="sticky top-0 z-10 -mx-1 space-y-1 bg-background/95 px-1 py-2 backdrop-blur">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{text}</span>
        {more.busy ? (
          <span>{more.progress ? `Loading ${more.progress.done} of ${more.progress.total}...` : 'Loading...'}</span>
        ) : null}
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
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none',
            more.busy && 'animate-pulse motion-reduce:animate-none',
          )}
          style={{ width: `${Math.min(100, (range.loaded / range.cap) * 100)}%` }}
        />
      </div>
    </div>
  )
}

/** The rail's "Load more" node; while loading it stays in place, marked busy and inert so focus is not lost. */
export function LoadMoreNode({
  busy,
  error,
  onLoadMore,
}: {
  busy: boolean
  error: string | null
  onLoadMore: () => Promise<void> | void
}) {
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
