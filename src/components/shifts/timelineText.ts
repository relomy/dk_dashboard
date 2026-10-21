import type { Timeline } from '../../lib/shifts'
import type { TimelineRange } from '../../lib/timelineSource'

export function clockOf(snapshotAt: string): string {
  const date = new Date(snapshotAt)
  return Number.isNaN(date.getTime())
    ? snapshotAt
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** A time with its date when it falls on an earlier day than `reference`, in the same local time as the rest of the rail. */
export function stampOf(at: string, reference: string | null): string {
  const date = new Date(at)
  const ref = reference === null ? null : new Date(reference)
  if (Number.isNaN(date.getTime()) || !ref || Number.isNaN(ref.getTime()) || date.toDateString() === ref.toDateString())
    return clockOf(at)
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${clockOf(at)}`
}

/** The oldest snapshot time the rail reaches, whether a step, a gap or the range note's digest. */
export function rangeFloor(timeline: Timeline): number | null {
  const times = [
    ...timeline.entries.map((entry) => entry.snapshotAt),
    ...(timeline.rangeNote ? [timeline.rangeNote.snapshotAt] : []),
  ].map((at) => Date.parse(at))
  return times.length > 0 ? Math.min(...times) : null
}

/** Why loading stopped, at the rail's tail. */
export function rangeNoteText(range: TimelineRange, rangeNote: Timeline['rangeNote']): string | null {
  if (!range.reach || !rangeNote) return null
  const at = clockOf(rangeNote.snapshotAt)
  if (range.reach === 'contest-start') return `Contest start: the first snapshot is at ${at}.`
  if (range.reach === 'cap') return `Stopped at the cap of ${range.cap} snapshots. Older Steps are not loaded.`
  return `From ${at}. The loaded history ends here.`
}
