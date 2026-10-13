import type { LiveModel } from './liveModel'

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

// --- Thresholds -------------------------------------------------------------------------------------------------
// A tuned-by-feel starting point, to be adjusted against real snapshots. A move smaller than its threshold is
// ignored. All figures are net moves between the Seen mark and the current Live model.
/** VIP rank, in places. */
export const VIP_RANK_THRESHOLD = 2
/** VIP points. */
export const VIP_POINTS_THRESHOLD = 1.0
/** Distance to cash, in points; a VIP shifts when either this or the rank threshold is met. */
export const DISTANCE_TO_CASH_POINTS_THRESHOLD = 1.0
/** Distance to cash, in ranks. */
export const DISTANCE_TO_CASH_RANK_THRESHOLD = 2
// ----------------------------------------------------------------------------------------------------------------

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

function moveOf<T>(from: T, to: T): Move<T> {
  return { from, to }
}

/** True when both sides are known and differ by at least the threshold (rounded to absorb float noise). */
function movedBy(move: Move<number | null>, threshold: number): boolean {
  if (move.from === null || move.to === null) return false
  return Math.round(Math.abs(move.to - move.from) * 1e6) >= Math.round(threshold * 1e6)
}

/**
 * Net VIP shifts: one item per VIP present on both sides whose rank, points or distance to cash moved by at least
 * its threshold. A VIP on one side only (added to or removed from the Profile) is that VIP's baseline: no shift.
 */
function netVipShifts(seen: Digest, current: Digest, detectedAt: number): VipShiftItem[] {
  const before = new Map<string, VipDigest>()
  for (const vip of seen.vips) if (!before.has(vip.key)) before.set(vip.key, vip)
  const items: VipShiftItem[] = []
  const done = new Set<string>()
  for (const vip of current.vips) {
    const prior = before.get(vip.key)
    if (!prior || done.has(vip.key)) continue
    done.add(vip.key)
    const rank = moveOf(prior.rank, vip.rank)
    const points = moveOf(prior.points, vip.points)
    const distanceToCashPoints = moveOf(prior.distanceToCash.points, vip.distanceToCash.points)
    const distanceToCashRank = moveOf(prior.distanceToCash.rank, vip.distanceToCash.rank)
    const shifted =
      movedBy(rank, VIP_RANK_THRESHOLD) ||
      movedBy(points, VIP_POINTS_THRESHOLD) ||
      movedBy(distanceToCashPoints, DISTANCE_TO_CASH_POINTS_THRESHOLD) ||
      movedBy(distanceToCashRank, DISTANCE_TO_CASH_RANK_THRESHOLD)
    if (!shifted) continue
    items.push({
      kind: 'vip',
      id: `vip:${vip.key}:${seen.at}`,
      priority: 'normal',
      detectedAt,
      vipKey: vip.key,
      rank,
      points,
      distanceToCashPoints,
      distanceToCashRank,
    })
  }
  return items
}

function rankMagnitude(item: ShiftItem): number {
  if (item.kind !== 'vip' || item.rank.from === null || item.rank.to === null) return 0
  return Math.abs(item.rank.to - item.rank.from)
}

/** High priority first, then the largest absolute rank move. */
function orderFeed(items: ShiftItem[]): ShiftItem[] {
  const weight = (item: ShiftItem) => (item.priority === 'high' ? 1 : 0)
  return [...items].sort((a, b) => weight(b) - weight(a) || rankMagnitude(b) - rankMagnitude(a))
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

  let items: ShiftItem[] = []

  return {
    record(model) {
      items = []
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
        items = orderFeed([...netVipShifts(stored.seen, digest, digest.at)])
      } catch {
        items = []
        // Recording must never break the Live view.
      }
    },
    feed: () => items,
    unseenCount: () => items.length,
    unsurfaced: () => [],
    gap: () => null,
    markSeen() {},
    markSurfaced() {},
  }
}
