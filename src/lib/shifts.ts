import type { LiveModel } from './liveModel'
import { AUTO_ADVANCE_MS, SUMMARY_MS } from './shiftsConfig'
import { digestOf, reconcileSeen } from './shiftsDigest'
import { cashLineShift, netVipShifts, orderFeed, withCrossings } from './shiftsDiff'
import { appendEntries, contestStateItems, detectCompletion, detectCrossings, isStoredState } from './shiftsLog'
import type { LogEntry, StoredState } from './shiftsLog'
import type { ShiftItem } from './shiftsTypes'

export {
  AUTO_ADVANCE_MS,
  CASH_LINE_POINTS_THRESHOLD,
  CASH_LINE_RANK_THRESHOLD,
  DISTANCE_TO_CASH_POINTS_THRESHOLD,
  DISTANCE_TO_CASH_RANK_THRESHOLD,
  HIGH_LOG_CAP,
  SUMMARY_MS,
  VIP_POINTS_THRESHOLD,
  VIP_RANK_THRESHOLD,
} from './shiftsConfig'
export type { Digest } from './shiftsDigest'
export { digestOf } from './shiftsDigest'
export { diffDigests } from './shiftsDiff'
export { buildTimeline, isGapMarker } from './shiftsTimeline'
export type {
  GapReason,
  RangeNote,
  Timeline,
  TimelineEntry,
  TimelineGapEntry,
  TimelineGapMarker,
  TimelineInput,
  TimelineOptions,
  TimelineReach,
  TimelineStep,
} from './shiftsTimeline'
export type {
  CashLineMove,
  CashLineShiftItem,
  ContestShiftItem,
  CrossingPath,
  FinalStanding,
  ItemCrossing,
  LineupSlotDiff,
  Move,
  ShiftItem,
  ShiftPart,
  ShiftPriority,
  VipShiftItem,
} from './shiftsTypes'

/**
 * The Shifts feed: what moved for your VIPs since the Seen mark. It works only from the interpreted Live model
 * and reads no snapshot fields of its own.
 *
 * The Live model carries no contest key and no `generated_at`, and adding them would mean new snapshot reads
 * (and removing `generated_at` from `liveUnreadAllowlist.json`). So a contest is identified by the model header
 * (name plus start time) and `snapshotAt` stands in for the snapshot's `generated_at`.
 *
 * Net VIP moves (rank, points, distance to cash) are compared against the Seen mark on each build.
 */

/** The slice of the Web Storage API the feed uses; tests pass an in-memory stub. */
export interface ShiftsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Set when a visit follows a long absence and something is unseen. */
export interface AwaySummary {
  unseenCount: number
  topItem: ShiftItem
  minutesAway: number
}

export interface RecordOptions {
  /** True when the page is opening or the tab is returning to visible. */
  visit: boolean
}

export interface ShiftsFeed {
  /** Records a Live model build for its sport, seeding or switching as needed. Never throws. */
  record(model: LiveModel, options: RecordOptions): void
  /** Everything unseen for the last recorded sport, High priority first. */
  feed(): ShiftItem[]
  unseenCount(): number
  /** High priority items not yet passed to `markSurfaced`. */
  unsurfaced(): ShiftItem[]
  /** The away summary data, or null. */
  awaySummary(): AwaySummary | null
  /** True after a quick visit moved the Seen mark on by itself; cleared by the next visit or by `markSeen`. */
  autoAdvanced(): boolean
  /** Advances the Seen mark to now and clears the High priority log. */
  markSeen(): void
  /** The Seen mark's snapshot time, or null before the feed is seeded. Read-only; `subscribe` follows its moves. */
  seenSnapshotAt(): string | null
  /** Marks High items as shown; the items stay in the feed until `markSeen`. */
  markSurfaced(ids: string[]): void
  /** Calls `listener` after the feed changes; returns the function that stops it. */
  subscribe(listener: () => void): () => void
}

export interface ShiftsFeedOptions {
  /** Defaults to `globalThis.localStorage`; null (or a storage that throws) degrades to no shifts. */
  storage?: ShiftsStorage | null
  /** Defaults to `Date.now`. */
  now?: () => number
}

const STORAGE_KEY_PREFIX = 'dk_dashboard_shifts_'

function defaultStorage(): ShiftsStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function createShiftsFeed(options: ShiftsFeedOptions = {}): ShiftsFeed {
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const now = options.now ?? Date.now

  function read(storageKey: string): StoredState | null {
    try {
      const raw = storage?.getItem(storageKey)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      return isStoredState(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  function write(storageKey: string, state: StoredState): void {
    try {
      storage?.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Storage can be blocked or full; the feed just stays empty.
    }
  }

  let items: ShiftItem[] = []
  let away: AwaySummary | null = null
  let autoAdvanced = false
  let currentKey: string | null = null
  let seenAt: string | null = null
  const readSeenAt = (): string | null => (currentKey ? (read(currentKey)?.seen.snapshotAt ?? null) : null)
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  const feed: ShiftsFeed = {
    record(model, { visit }) {
      items = []
      if (visit) {
        away = null
        autoAdvanced = false
      }
      try {
        const storageKey = `${STORAGE_KEY_PREFIX}${model.sport}`
        if (storageKey !== currentKey) {
          // The flags describe the sport the feed followed before, not this one.
          away = null
          autoAdvanced = false
        }
        currentKey = storageKey
        const stored = read(storageKey)
        const digest = digestOf(model, now())
        if (!stored || stored.contestKey !== digest.contestKey) {
          // First visit, another primary contest or a corrupt value: seed both digests and drop the old state.
          write(storageKey, { contestKey: digest.contestKey, seen: digest, last: digest, log: [] })
          away = null
          autoAdvanced = false
          return
        }
        const awayMs = Math.max(0, digest.at - stored.last.at)
        if (visit && awayMs < AUTO_ADVANCE_MS) {
          // A quick look away: acknowledge everything, High priority log included.
          write(storageKey, { ...stored, seen: digest, last: digest, log: [] })
          autoAdvanced = true
          return
        }
        const seen = reconcileSeen(stored.seen, digest)
        const log = appendEntries(stored.log, [
          ...detectCompletion(stored.last, digest),
          ...detectCrossings(stored.last, digest),
        ])
        write(storageKey, { ...stored, seen, last: digest, log })
        items = orderFeed([
          ...contestStateItems(log, digest.snapshotAt),
          ...withCrossings(netVipShifts(seen, digest, seen.at), seen, digest, log, seen.at),
          ...cashLineShift(seen, digest, seen.at),
        ])
        if (visit && awayMs >= SUMMARY_MS && items.length > 0) {
          away = { unseenCount: items.length, topItem: items[0], minutesAway: Math.floor(awayMs / 60_000) }
        }
      } catch {
        items = []
        away = null
        // Recording must never break the Live view.
      }
    },
    feed: () => items,
    seenSnapshotAt: () => seenAt,
    unseenCount: () => items.length,
    unsurfaced: () => items.filter((item) => item.priority === 'high' && !item.surfaced),
    awaySummary: () => away,
    autoAdvanced: () => autoAdvanced,
    markSeen() {
      items = []
      away = null
      autoAdvanced = false
      try {
        const stored = currentKey ? read(currentKey) : null
        if (!currentKey || !stored) return
        write(currentKey, { ...stored, seen: { ...stored.last, at: now() }, log: [] })
      } catch {
        // Acknowledging is best effort.
      }
    },
    markSurfaced(ids) {
      try {
        const stored = currentKey ? read(currentKey) : null
        if (!currentKey || !stored) return
        const vipKeys = new Set(
          items.flatMap((item) => (item.kind === 'vip' && ids.includes(item.id) ? [item.vipKey] : [])),
        )
        const isShown = (entry: LogEntry) =>
          entry.kind === 'crossing' ? vipKeys.has(entry.vipKey) : ids.includes(entry.id)
        if (!stored.log.some(isShown)) return
        const log = stored.log.map((entry) => (isShown(entry) ? { ...entry, surfaced: true } : entry))
        write(currentKey, { ...stored, log })
        items = items.map((item) =>
          (item.kind === 'vip' && vipKeys.has(item.vipKey)) || (item.kind === 'contest-state' && ids.includes(item.id))
            ? { ...item, surfaced: true }
            : item,
        )
      } catch {
        // Surfacing is best effort; the item simply shows again.
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return {
    ...feed,
    record(model, options) {
      feed.record(model, options)
      seenAt = readSeenAt()
      notify()
    },
    markSeen() {
      feed.markSeen()
      seenAt = readSeenAt()
      notify()
    },
    markSurfaced(ids) {
      feed.markSurfaced(ids)
      notify()
    },
  }
}
