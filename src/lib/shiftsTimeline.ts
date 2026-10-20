import type { Digest } from './shiftsDigest'
import { vipsByKey } from './shiftsDigest'
import { diffDigests } from './shiftsDiff'
import { moveOf } from './shiftsMoves'
import type { FinalStanding, ShiftItem } from './shiftsTypes'

/** Why a snapshot is skipped: it failed to load (retryable), the producer's sport data was not fresh, or it is not renderable. */
export type GapReason = 'unavailable' | 'not-fresh' | 'not-renderable'

/** Stands in the input where a snapshot was skipped: it failed to load or interpret, or its sport was not fresh. */
export interface TimelineGapMarker {
  reason: GapReason
  /** The skipped snapshot's `snapshot_at`. */
  snapshotAt: string
}

/** The Timeline's input: digests and gap markers, oldest first. */
export type TimelineInput = Digest | TimelineGapMarker

/** One snapshot's slice of the Timeline: the items that shifted between it and the snapshot before it. */
export interface TimelineStep {
  kind: 'step'
  id: string
  snapshotAt: string
  items: ShiftItem[]
}

/** A skipped snapshot, shown where its step would have been. */
export interface TimelineGapEntry {
  kind: 'gap'
  id: string
  snapshotAt: string
  reason: GapReason
}

export type TimelineEntry = TimelineStep | TimelineGapEntry

export function isGapMarker(input: TimelineInput): input is TimelineGapMarker {
  return 'reason' in input
}

/** What stopped the range: the oldest loaded snapshot is the window's start, the contest's start, or the cap. */
export type TimelineReach = 'window' | 'contest-start' | 'cap'

/** The note at the tail of the rail: "From HH:MM" (`from`), the contest's start, or the cap. */
export interface RangeNote {
  kind: 'from' | 'contest-start' | 'cap'
  /** The oldest digest's `snapshot_at`. */
  snapshotAt: string
}

export interface TimelineOptions {
  /** Why the input starts where it does; defaults to `window` (the note reads "From HH:MM"). */
  reach?: TimelineReach
}

export interface Timeline {
  /** Steps and gaps, newest first. */
  entries: TimelineEntry[]
  /** Null when there is no digest. */
  rangeNote: RangeNote | null
}

/** The step for the contest completing: the final standings sit on its one state item, not on per-VIP items. */
function withFinalStandings(items: ShiftItem[], before: Digest, after: Digest): ShiftItem[] {
  if (!items.some((item) => item.kind === 'contest-state')) return items
  const prior = vipsByKey(before.vips)
  const standings = [...vipsByKey(after.vips).values()].map((vip): FinalStanding => ({
    vipKey: vip.key,
    rank: moveOf(prior.get(vip.key)?.rank ?? null, vip.rank),
    points: moveOf(prior.get(vip.key)?.points ?? null, vip.points),
    cashing: vip.cashing,
  }))
  return items
    .filter((item) => item.kind !== 'vip' || item.crossing !== undefined || item.finishedCashing === undefined)
    .map((item) => (item.kind === 'contest-state' ? { ...item, standings } : item))
}

/** Links a cash line move to the VIP items in its step whose crossing it caused. */
function withCauseLinks(items: ShiftItem[]): ShiftItem[] {
  const caused = items.filter((item) => item.kind === 'vip' && item.crossing?.cause).map((item) => item.id)
  if (caused.length === 0) return items
  return items.map((item) => (item.kind === 'cash-line' ? { ...item, causedCrossings: caused } : item))
}

/**
 * Builds the Timeline: one step per consecutive pair of digests (oldest first in), newest first out, each timed by
 * the later snapshot. A gap marker yields a gap entry in its place, and the digests either side of it are compared
 * across it. Pure: it reads no storage and no Seen mark, and the same input always gives the same ids.
 */
export function buildTimeline(inputs: TimelineInput[], options: TimelineOptions = {}): Timeline {
  const entries: TimelineEntry[] = []
  let previous: Digest | null = null
  let oldest: Digest | null = null
  for (const input of inputs) {
    if (isGapMarker(input)) {
      entries.push({ kind: 'gap', id: `gap:${input.snapshotAt}`, snapshotAt: input.snapshotAt, reason: input.reason })
      continue
    }
    oldest ??= input
    if (previous) {
      const items = withCauseLinks(withFinalStandings(diffDigests(previous, input), previous, input))
      entries.push({ kind: 'step', id: `step:${input.snapshotAt}`, snapshotAt: input.snapshotAt, items })
    }
    previous = input
  }
  const kind = options.reach === 'contest-start' || options.reach === 'cap' ? options.reach : 'from'
  return { entries: entries.reverse(), rangeNote: oldest ? { kind, snapshotAt: oldest.snapshotAt } : null }
}
