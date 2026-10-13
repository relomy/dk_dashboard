import type { LiveModel } from './liveModel'

/**
 * The Shifts feed: what moved for your VIPs since the Seen mark. It works only from the interpreted Live model
 * and reads no snapshot fields of its own.
 *
 * The Live model carries no contest key and no `generated_at`, and adding them would mean new snapshot reads
 * (and removing `generated_at` from `liveUnreadAllowlist.json`). So a contest is identified by the model header
 * (name plus start time) and `snapshotAt` stands in for the snapshot's `generated_at`.
 *
 * This slice seeds, switches and persists; it produces no shifts yet, so the feed is always empty.
 */

/** The slice of the Web Storage API the feed uses; tests pass an in-memory stub. */
export interface ShiftsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** A `{from, to}` pair: every figure on a feed item, so the UI renders without re-deriving anything. */
export interface Move<T> {
  from: T
  to: T
}

export type ShiftPriority = 'high' | 'normal'

interface ShiftItemBase {
  id: string
  priority: ShiftPriority
  /** Epoch milliseconds of the build that detected the item. */
  detectedAt: number
  /** High items only: whether the UI has already shown the item (see `markSurfaced`). */
  surfaced?: boolean
}

/** One VIP's net moves since the Seen mark. Detail fields arrive with the detection slices. */
export interface VipShiftItem extends ShiftItemBase {
  kind: 'vip'
  vipKey: string
  rank: Move<number | null>
  points: Move<number | null>
  distanceToCashPoints: Move<number | null>
  distanceToCashRank: Move<number | null>
}

/** A cash line move or a contest state change. */
export interface ContestShiftItem extends ShiftItemBase {
  kind: 'cash-line' | 'contest-state'
}

export type ShiftItem = VipShiftItem | ContestShiftItem

/** Set when a visit follows a long absence and something is unseen. */
export interface ShiftsGap {
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
  /** The returned-after-a-gap data, or null. */
  gap(): ShiftsGap | null
  /** Advances the Seen mark to now and clears the High priority log. */
  markSeen(): void
  /** Marks High items as shown; the items stay in the feed until `markSeen`. */
  markSurfaced(ids: string[]): void
}

export interface ShiftsFeedOptions {
  /** Defaults to `globalThis.localStorage`; null (or a storage that throws) degrades to no shifts. */
  storage?: ShiftsStorage | null
  /** Defaults to `Date.now`. */
  now?: () => number
}

const STORAGE_KEY_PREFIX = 'dk_dashboard_shifts_'

interface PlayerDigest {
  key: string
  playerKey: string | null
  name: string
  slot: string
  points: number | null
  gameStatus: string | null
  locked: boolean
  stats: string | null
}

interface VipDigest {
  key: string
  rank: number | null
  points: number | null
  distanceToCash: { points: number | null; rank: number | null }
  cashing: boolean
  players: PlayerDigest[]
}

interface Digest {
  at: number
  snapshotAt: string
  contestKey: string
  contestState: string
  cashLine: { points: number | null; rank: number | null }
  vips: VipDigest[]
}

interface StoredState {
  contestKey: string
  seen: Digest
  last: Digest
  /** The High priority log; filled by the detection slices. */
  log: unknown[]
}

function contestKeyOf(model: LiveModel): string {
  return `${model.contest.name}|${model.contest.startTime ?? ''}`
}

function digestOf(model: LiveModel, at: number): Digest {
  return {
    at,
    snapshotAt: model.snapshotAt,
    contestKey: contestKeyOf(model),
    contestState: model.contest.state,
    cashLine: { points: model.cashLine.points, rank: model.cashLine.rank },
    vips: model.vips.map((vip) => ({
      key: vip.key,
      rank: vip.rank,
      points: vip.points,
      distanceToCash: { points: vip.distanceToCash.points, rank: vip.distanceToCash.rank },
      cashing: vip.cashing,
      players: vip.players.map((player) => ({
        key: player.key,
        playerKey: player.playerKey,
        name: player.name,
        slot: player.slot,
        points: player.points,
        gameStatus: player.gameStatus,
        locked: player.locked,
        stats: player.stats,
      })),
    })),
  }
}

function isDigest(value: unknown): value is Digest {
  if (typeof value !== 'object' || value === null) return false
  const digest = value as Record<string, unknown>
  return typeof digest.at === 'number' && typeof digest.contestKey === 'string' && Array.isArray(digest.vips)
}

function isStoredState(value: unknown): value is StoredState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return typeof state.contestKey === 'string' && isDigest(state.seen) && isDigest(state.last) && Array.isArray(state.log)
}

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

  return {
    record(model) {
      try {
        const storageKey = `${STORAGE_KEY_PREFIX}${model.sport}`
        const stored = read(storageKey)
        const digest = digestOf(model, now())
        if (!stored || stored.contestKey !== digest.contestKey) {
          // First visit, another primary contest or a corrupt value: seed both digests and drop the old state.
          write(storageKey, { contestKey: digest.contestKey, seen: digest, last: digest, log: [] })
          return
        }
        write(storageKey, { ...stored, last: digest })
      } catch {
        // Recording must never break the Live view.
      }
    },
    feed: () => [],
    unseenCount: () => 0,
    unsurfaced: () => [],
    gap: () => null,
    markSeen() {},
    markSurfaced() {},
  }
}
