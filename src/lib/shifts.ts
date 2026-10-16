import type { GameStatus, LiveModel } from './liveModel'
import type { ContestState } from './types'

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

/**
 * One slot of a VIP's lineup diff. Points, game status and the `stats` line follow the player (matched by
 * `playerKey`); `locked` follows the slot position.
 */
export interface LineupSlotDiff {
  /** The slot's key in the Live model (`slot-index`). */
  key: string
  slot: string
  /** The current player's name; the locked label for a still-hidden slot. */
  name: string
  playerKey: string | null
  /** Raw points; `from` is null for a revealed or swapped-in player, both are null for a hidden slot. */
  points: Move<number | null>
  /** The player's own points move. A reveal's move is the player's first points. Null when not comparable. */
  pointsMove: number | null
  locked: Move<boolean>
  gameStatus: Move<GameStatus | null>
  /** Present only when the `stats` line adds information: it changed to a non-empty line. */
  stats?: Move<string | null>
}

/** The cash line's move in points and rank. */
export interface CashLineMove {
  points: Move<number | null>
  rank: Move<number | null>
}

/**
 * The path of a VIP's cash crossings since the Seen mark: its first and last crossing. A single direction when they
 * agree (the VIP crossed once, or ended on the same side as its latest crossing), else `x then y`.
 */
export type CrossingPath = 'in' | 'out' | 'in then out' | 'out then in'

/** A cash crossing carried on a VIP item. */
export interface ItemCrossing {
  path: CrossingPath
  /** The cash line move in the same poll as the latest crossing, or null when the line did not move enough. */
  cause: CashLineMove | null
}

/** One VIP's net moves since the Seen mark. Detail fields arrive with the detection slices. */
export interface VipShiftItem extends ShiftItemBase {
  kind: 'vip'
  vipKey: string
  rank: Move<number | null>
  points: Move<number | null>
  distanceToCashPoints: Move<number | null>
  distanceToCashRank: Move<number | null>
  /**
   * Every slot of the lineup, changed or not: changed players by absolute points move, then unchanged
   * players, then still-hidden slots. Omitted when the lineup cannot be compared.
   */
  lineup?: LineupSlotDiff[]
  /** Present when the VIP crossed into or out of cashing since the Seen mark; the item is then High priority. */
  crossing?: ItemCrossing
  /**
   * Present only once the contest is completed, when the item carries final standings only: rank and points as
   * `{from, to}` pairs, whether the VIP finished cashing, no lineup, and no distance to cash (those moves are null).
   */
  finishedCashing?: boolean
}

/** The net cash line move since the Seen mark, reported above its threshold. */
export interface CashLineShiftItem extends ShiftItemBase, CashLineMove {
  kind: 'cash-line'
}

/** A contest state change. */
export interface ContestShiftItem extends ShiftItemBase {
  kind: 'contest-state'
  state: Move<ContestState>
}

export type ShiftItem = VipShiftItem | CashLineShiftItem | ContestShiftItem

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
/** The cash line, in points; the line moves when either this or the rank threshold is met. */
export const CASH_LINE_POINTS_THRESHOLD = 1.0
/** The cash line, in ranks. */
export const CASH_LINE_RANK_THRESHOLD = 2
/** The High priority log keeps at most this many entries; the oldest are dropped first. */
export const HIGH_LOG_CAP = 50
/** A visit after a gap shorter than this advances the Seen mark silently, in milliseconds. */
export const AUTO_ADVANCE_MS = 10 * 60_000
/** A visit after a gap of at least this long sets the returned-after-a-gap flag (when something is unseen). */
export const SUMMARY_MS = 30 * 60_000
// ----------------------------------------------------------------------------------------------------------------

interface PlayerDigest {
  key: string
  playerKey: string | null
  name: string
  slot: string
  points: number | null
  gameStatus: GameStatus | null
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
  contestState: ContestState
  cashLine: { points: number | null; rank: number | null }
  vips: VipDigest[]
}

/** A cash crossing in the High priority log. Later tickets add other entry kinds to this union. */
interface CrossingEntry {
  id: string
  kind: 'crossing'
  seq: number
  vipKey: string
  direction: 'in' | 'out'
  at: number
  surfaced: boolean
  cause: CashLineMove | null
}

/** A contest state change to completed in the High priority log. */
interface ContestStateEntry {
  id: string
  kind: 'contest-state'
  seq: number
  at: number
  surfaced: boolean
  from: ContestState
  to: ContestState
}

type LogEntry = CrossingEntry | ContestStateEntry

interface StoredState {
  contestKey: string
  seen: Digest
  last: Digest
  /** The High priority log, capped at `HIGH_LOG_CAP`. */
  log: LogEntry[]
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

function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  const common = typeof entry.id === 'string' && typeof entry.seq === 'number' && typeof entry.at === 'number' && typeof entry.surfaced === 'boolean'
  if (entry.kind === 'contest-state') return common && typeof entry.from === 'string' && typeof entry.to === 'string'
  return (
    entry.kind === 'crossing' && common && typeof entry.vipKey === 'string' && (entry.direction === 'in' || entry.direction === 'out')
  )
}

function isStoredState(value: unknown): value is StoredState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    typeof state.contestKey === 'string' &&
    isDigest(state.seen) &&
    isDigest(state.last) &&
    Array.isArray(state.log) &&
    state.log.every(isLogEntry)
  )
}

/**
 * The Seen mark as it applies to the current model: a VIP's own first appearance is that VIP's baseline, so a VIP
 * new to the model joins the Seen mark as it is now (quietly), and a VIP gone from the model drops out of it.
 */
function reconcileSeen(seen: Digest, current: Digest): Digest {
  const known = vipsByKey(seen.vips)
  return { ...seen, vips: [...vipsByKey(current.vips).values()].map((vip) => known.get(vip.key) ?? vip) }
}

function moveOf<T>(from: T, to: T): Move<T> {
  return { from, to }
}

/** True when both sides are known and differ by at least the threshold (rounded to absorb float noise). */
function movedBy(move: Move<number | null>, threshold: number): boolean {
  if (move.from === null || move.to === null) return false
  return Math.round(Math.abs(move.to - move.from) * 1e6) >= Math.round(threshold * 1e6)
}

function sameValue<T>(move: Move<T>): boolean {
  return move.from === move.to
}

/** Rounded so that float noise in a points subtraction does not show. */
function pointsMoveOf(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null
  return Math.round((to - from) * 1e6) / 1e6
}

/** VIPs by key; a VIP listed twice keeps its first entry. */
function vipsByKey(vips: VipDigest[]): Map<string, VipDigest> {
  const byKey = new Map<string, VipDigest>()
  for (const vip of vips) if (!byKey.has(vip.key)) byKey.set(vip.key, vip)
  return byKey
}

/** A player is the same across polls by `playerKey`, else by trimmed name; never by slot position. */
function playerIdOf(player: PlayerDigest): string {
  return player.playerKey ? `key:${player.playerKey}` : `name:${player.name.trim()}`
}

/**
 * The lineup diff: one entry per slot of the current lineup. A locked slot now unlocked is a reveal, decided by
 * slot position: no points before, the first points as its move. Every other move is the player's own points,
 * matched by `playerKey`; a player who appears (a late swap) is not compared.
 */
function lineupDiff(before: PlayerDigest[], after: PlayerDigest[]): LineupSlotDiff[] {
  const prior = new Map<string, PlayerDigest>()
  for (const player of before) if (!player.locked && !prior.has(playerIdOf(player))) prior.set(playerIdOf(player), player)
  const changed: LineupSlotDiff[] = []
  const unchanged: LineupSlotDiff[] = []
  const hidden: LineupSlotDiff[] = []
  after.forEach((player, index) => {
    const wasLocked = before[index]?.locked ?? false
    const locked = moveOf(wasLocked, player.locked)
    if (player.locked) {
      hidden.push({
        key: player.key,
        slot: player.slot,
        name: player.name,
        playerKey: null,
        points: moveOf(null, null),
        pointsMove: null,
        locked,
        gameStatus: moveOf(null, null),
      })
      return
    }
    const reveal = wasLocked
    const match = reveal ? undefined : prior.get(playerIdOf(player))
    const points = moveOf(match?.points ?? null, player.points)
    const pointsMove = reveal ? player.points : pointsMoveOf(points.from, points.to)
    const gameStatus = moveOf(match?.gameStatus ?? null, player.gameStatus)
    const slot: LineupSlotDiff = {
      key: player.key,
      slot: player.slot,
      name: player.name,
      playerKey: player.playerKey,
      points,
      pointsMove,
      locked,
      gameStatus,
    }
    const stats = moveOf(match?.stats ?? null, player.stats)
    if ((match || reveal) && stats.to !== null && !sameValue(stats)) slot.stats = stats
    const slotChanged = (pointsMove ?? 0) !== 0 || reveal || (match !== undefined && !sameValue(gameStatus)) || slot.stats !== undefined
    ;(slotChanged ? changed : unchanged).push(slot)
  })
  changed.sort((a, b) => Math.abs(b.pointsMove ?? 0) - Math.abs(a.pointsMove ?? 0))
  return [...changed, ...unchanged, ...hidden]
}

/**
 * Net VIP shifts: one item per VIP present on both sides whose rank, points or distance to cash moved by at least
 * its threshold. A VIP on one side only (added to or removed from the Profile) is quietly ignored: no shift.
 */
function netVipShifts(seen: Digest, current: Digest, detectedAt: number): VipShiftItem[] {
  const final = current.contestState === 'completed'
  const before = vipsByKey(seen.vips)
  const items: VipShiftItem[] = []
  const handledKeys = new Set<string>()
  for (const vip of current.vips) {
    const prior = before.get(vip.key)
    if (!prior || handledKeys.has(vip.key)) continue
    handledKeys.add(vip.key)
    const item = vipItemOf(prior, vip, seen, detectedAt, final)
    // Final standings are settled, so any difference in them is worth reporting; live moves must clear a threshold.
    const shifted = final
      ? !sameValue(item.rank) || !sameValue(item.points) || prior.cashing !== vip.cashing
      : movedBy(item.rank, VIP_RANK_THRESHOLD) ||
        movedBy(item.points, VIP_POINTS_THRESHOLD) ||
        movedBy(item.distanceToCashPoints, DISTANCE_TO_CASH_POINTS_THRESHOLD) ||
        movedBy(item.distanceToCashRank, DISTANCE_TO_CASH_RANK_THRESHOLD)
    if (shifted) items.push(item)
  }
  return items
}

/** A VIP's item from the Seen mark to now: live moves and lineup, or final standings only once completed. */
function vipItemOf(prior: VipDigest, vip: VipDigest, seen: Digest, detectedAt: number, final: boolean): VipShiftItem {
  const item: VipShiftItem = {
    kind: 'vip',
    id: itemId('vip', vip.key, seen.at),
    priority: 'normal',
    detectedAt,
    vipKey: vip.key,
    rank: moveOf(prior.rank, vip.rank),
    points: moveOf(prior.points, vip.points),
    distanceToCashPoints: final ? moveOf(null, null) : moveOf(prior.distanceToCash.points, vip.distanceToCash.points),
    distanceToCashRank: final ? moveOf(null, null) : moveOf(prior.distanceToCash.rank, vip.distanceToCash.rank),
  }
  if (final) item.finishedCashing = vip.cashing
  else item.lineup = lineupDiff(prior.players, vip.players)
  return item
}

/** True when either figure of the cash line moved by at least its threshold. */
function cashLineMoved(move: CashLineMove): boolean {
  return movedBy(move.points, CASH_LINE_POINTS_THRESHOLD) || movedBy(move.rank, CASH_LINE_RANK_THRESHOLD)
}

function cashLineMoveOf(from: Digest, to: Digest): CashLineMove {
  return { points: moveOf(from.cashLine.points, to.cashLine.points), rank: moveOf(from.cashLine.rank, to.cashLine.rank) }
}

/** The net cash line move since the Seen mark, or none below its threshold. */
function cashLineShift(seen: Digest, current: Digest, detectedAt: number): CashLineShiftItem[] {
  const move = cashLineMoveOf(seen, current)
  if (!cashLineMoved(move)) return []
  return [{ kind: 'cash-line', id: itemId('cash-line', seen.at), priority: 'normal', detectedAt, ...move }]
}

type NewCrossing = Omit<CrossingEntry, 'seq' | 'id'>

/**
 * Cash crossings between two consecutive builds, for VIPs present on both sides. A cash line move in the same poll
 * is carried as the cause.
 */
function detectCrossings(last: Digest, current: Digest): NewCrossing[] {
  // A flip in the poll that completes the contest still counts; from the next poll on only final standings are
  // compared, so a flip of cashing is reported there, not as a crossing.
  if (last.contestState === 'completed') return []
  const before = vipsByKey(last.vips)
  const move = cashLineMoveOf(last, current)
  const cause = cashLineMoved(move) ? move : null
  const crossings: NewCrossing[] = []
  const handledKeys = new Set<string>()
  for (const vip of current.vips) {
    const prior = before.get(vip.key)
    if (!prior || handledKeys.has(vip.key)) continue
    handledKeys.add(vip.key)
    if (prior.cashing === vip.cashing) continue
    crossings.push({ kind: 'crossing', vipKey: vip.key, direction: vip.cashing ? 'in' : 'out', at: current.at, surfaced: false, cause })
  }
  return crossings
}

type NewContestState = Omit<ContestStateEntry, 'seq' | 'id'>

/** The contest becoming completed between two consecutive builds, once. */
function detectCompletion(last: Digest, current: Digest): NewContestState[] {
  if (last.contestState === 'completed' || current.contestState !== 'completed') return []
  return [{ kind: 'contest-state', at: current.at, surfaced: false, from: last.contestState, to: current.contestState }]
}

function appendEntries(log: LogEntry[], newEntries: (NewCrossing | NewContestState)[]): LogEntry[] {
  let seq = log.reduce((max, entry) => Math.max(max, entry.seq), 0)
  const added = newEntries.map((entry): LogEntry => {
    seq += 1
    return entry.kind === 'crossing'
      ? { ...entry, seq, id: itemId('crossing', entry.vipKey, seq) }
      : { ...entry, seq, id: itemId('contest-state', seq) }
  })
  return [...log, ...added].slice(-HIGH_LOG_CAP)
}

/** The contest-level items for the log's state changes, oldest first. */
function contestStateItems(log: LogEntry[]): ContestShiftItem[] {
  return log.flatMap((entry): ContestShiftItem[] =>
    entry.kind === 'contest-state'
      ? [{ kind: 'contest-state', id: entry.id, priority: 'high', detectedAt: entry.at, surfaced: entry.surfaced, state: moveOf(entry.from, entry.to) }]
      : [],
  )
}

/** Every item and log entry id is `kind:part:part`; the formats live here. */
function itemId(kind: ShiftItem['kind'] | 'crossing', ...parts: (string | number)[]): string {
  return [kind, ...parts].join(':')
}

/**
 * Folds the log's crossings into the VIP items: a crossing makes the VIP's item High with its path, and creates the
 * item (from the Seen mark's rank and points) when the net moves alone would not have. A VIP missing from the Seen
 * mark or the current model gets none.
 */
function withCrossings(items: VipShiftItem[], seen: Digest, current: Digest, log: LogEntry[], detectedAt: number): VipShiftItem[] {
  const byVip = new Map<string, CrossingEntry[]>()
  for (const entry of log) if (entry.kind === 'crossing') byVip.set(entry.vipKey, [...(byVip.get(entry.vipKey) ?? []), entry])
  const result = new Map(items.map((item) => [item.vipKey, item]))
  const priorOf = vipsByKey(seen.vips)
  for (const vip of current.vips) {
    const crossings = byVip.get(vip.key)
    const prior = priorOf.get(vip.key)
    if (!crossings || !prior) continue
    const firstDirection = crossings[0].direction
    const latestCrossing = crossings[crossings.length - 1]
    const path: CrossingPath = firstDirection === latestCrossing.direction ? firstDirection : firstDirection === 'in' ? 'in then out' : 'out then in'
    const baseItem = result.get(vip.key) ?? vipItemOf(prior, vip, seen, detectedAt, current.contestState === 'completed')
    result.set(vip.key, {
      ...baseItem,
      priority: 'high',
      surfaced: crossings.every((entry) => entry.surfaced),
      crossing: { path, cause: latestCrossing.cause },
    })
  }
  return [...result.values()]
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
  let gap: ShiftsGap | null = null
  let currentKey: string | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  const feed: ShiftsFeed = {
    record(model, { visit }) {
      items = []
      if (visit) gap = null
      try {
        const storageKey = `${STORAGE_KEY_PREFIX}${model.sport}`
        currentKey = storageKey
        const stored = read(storageKey)
        const digest = digestOf(model, now())
        if (!stored || stored.contestKey !== digest.contestKey) {
          // First visit, another primary contest or a corrupt value: seed both digests and drop the old state.
          write(storageKey, { contestKey: digest.contestKey, seen: digest, last: digest, log: [] })
          gap = null
          return
        }
        const gapMs = Math.max(0, digest.at - stored.last.at)
        if (visit && gapMs < AUTO_ADVANCE_MS) {
          // A quick look away: acknowledge everything, High priority log included.
          write(storageKey, { ...stored, seen: digest, last: digest, log: [] })
          return
        }
        const seen = reconcileSeen(stored.seen, digest)
        const log = appendEntries(stored.log, [...detectCompletion(stored.last, digest), ...detectCrossings(stored.last, digest)])
        write(storageKey, { ...stored, seen, last: digest, log })
        items = orderFeed([
          ...contestStateItems(log),
          ...withCrossings(netVipShifts(seen, digest, digest.at), seen, digest, log, digest.at),
          ...cashLineShift(seen, digest, digest.at),
        ])
        if (visit && gapMs >= SUMMARY_MS && items.length > 0) {
          gap = { unseenCount: items.length, topItem: items[0], minutesAway: Math.floor(gapMs / 60_000) }
        }
      } catch {
        items = []
        gap = null
        // Recording must never break the Live view.
      }
    },
    feed: () => items,
    unseenCount: () => items.length,
    unsurfaced: () => items.filter((item) => item.priority === 'high' && !item.surfaced),
    gap: () => gap,
    markSeen() {
      items = []
      gap = null
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
        const vipKeys = new Set(items.flatMap((item) => (item.kind === 'vip' && ids.includes(item.id) ? [item.vipKey] : [])))
        const isShown = (entry: LogEntry) => (entry.kind === 'crossing' ? vipKeys.has(entry.vipKey) : ids.includes(entry.id))
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
      notify()
    },
    markSeen() {
      feed.markSeen()
      notify()
    },
    markSurfaced(ids) {
      feed.markSurfaced(ids)
      notify()
    },
  }
}
