import type { GameStatus } from './liveModel'
import type { ContestState } from './types'

/** A `{from, to}` pair: every figure on a feed item, so the UI renders without re-deriving anything. */
export interface Move<T> {
  from: T
  to: T
}

export type ShiftPriority = 'high' | 'normal'

/** The five kinds of change an item can carry: what a kind filter chooses between. */
export type ShiftPart = 'rank-points' | 'player-events' | 'cash-line' | 'crossings' | 'contest-state'

interface ShiftItemBase {
  id: string
  priority: ShiftPriority
  /** Epoch milliseconds of the build that detected the item (the build clock, not the snapshot's time). */
  detectedAt: number
  /** The `snapshot_at` of the snapshot the item was built from. */
  snapshotAt: string
  /** The kinds of change in the item that passed their thresholds. */
  parts: ShiftPart[]
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
  /** Timeline only: the ids of the VIP items in the same step whose crossing this move caused. */
  causedCrossings?: string[]
}

/** A contest state change. */
export interface ContestShiftItem extends ShiftItemBase {
  kind: 'contest-state'
  state: Move<ContestState>
  /** Timeline only, on the item for the contest completing: every VIP's final standing, in one place. */
  standings?: FinalStanding[]
}

/** One VIP's final standing in a completed contest. */
export interface FinalStanding {
  vipKey: string
  rank: Move<number | null>
  points: Move<number | null>
  cashing: boolean
}

export type ShiftItem = VipShiftItem | CashLineShiftItem | ContestShiftItem
