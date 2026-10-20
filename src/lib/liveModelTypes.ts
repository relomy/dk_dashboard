import type { Threat as ContestMetricsThreat } from './generated/snapshot'
import type { LineupSlot } from './lineup'
import type { PlayerPoolRow } from './playerPool'
import type { ContestState, ValueIcon } from './types'

export type LiveNotRenderableReason =
  | { kind: 'unsupported-schema'; version: number | null }
  | { kind: 'sport-missing' }
  | { kind: 'no-primary-contest' }
  | { kind: 'primary-contest-missing' }

/**
 * A section the feed may omit. A missing object is `unavailable`; a present one is
 * `available`, and a present but empty list inside it is the section's empty state.
 * The discriminant is `availability`, not `status`: Status means data freshness (GLOSSARY.md).
 */
export type Section<T> = { availability: 'unavailable' } | { availability: 'available'; data: T }

export interface LiveContestHeader {
  name: string
  state: ContestState
  /** The contest's start time; null when absent. Stands in for a finish time until the feed has one. */
  startTime: string | null
}

export interface LiveCashLine {
  points: number | null
  rank: number | null
}

export interface LiveDistanceToCash {
  points: number | null
  rank: number | null
}

export interface LiveVip {
  /** Stable React key: entry_key, then vip_entry_key, then display_name. */
  key: string
  name: string
  cashing: boolean
  distanceToCash: LiveDistanceToCash
  /** The contest live metrics update time; null when absent. */
  updatedAt: string | null
  /** The normalized lineup rank, then the standings row's. */
  rank: number | null
  /** The normalized lineup points, then the standings row's. */
  points: number | null
  /** Points if the lineup scores as projected: final points for finished players, else the real-time projection. */
  projectedPoints: number | null
  /** The normalized lineup PMR, then the standings row's. */
  pmr: number | null
  /** The standings row's, then the VIP leverage row's remaining ownership. */
  ownershipRemainingPct: number | null
  /**
   * Lineup ownership: the summed ownership of the lineup's players, from the per-VIP ownership
   * summary as `total_ownership_pct`.
   */
  lineupOwnershipPct: number | null
  /** The producer's `players_live` list; missing and empty lists show no players. */
  players: LiveLineupPlayer[]
  /** The train this VIP's lineup shares the most players with, when that is at least `TRAIN_NOTICE_MIN_SHARED`. */
  trainOverlap: LiveVipTrainOverlap | null
  /** The VIP's `vip_vs_field_leverage` row, matched by entry key; unavailable when the feed has none for them. */
  leverage: Section<LiveVipLeverage>
}

/**
 * One VIP's ownership leverage against the field, as the producer computes it. The uniqueness delta is the
 * field figure less the VIP figure, so the leverage panel compares the VIP with the field on these two.
 */
export interface LiveVipLeverage {
  vipRemainingPct: number | null
  fieldRemainingPct: number | null
  /** Positive means the VIP is more unique than the field. */
  uniquenessDeltaPct: number | null
  /** The VIP's lineup has a locked or unresolved slot, so their remaining ownership is undercounted. */
  partial: boolean
}

/** The field's average ownership remaining per entry, and what the producer averaged over. */
export interface LiveFieldRemaining {
  pct: number
  /** The threat metrics' `field_remaining_scope`; null for the ownership leaders total, which states none. */
  scope: ContestMetricsThreat['field_remaining_scope'] | null
}

export interface LiveVipTrainOverlap {
  trainId: string
  entries: number
  rank: number | null
  /** Players the VIP's lineup shares with the train, by name. */
  shared: number
  /** The VIP's lineup size. */
  slotCount: number
}

/** One player in a lineup, as the lineup cards show them. Fields the feed omits are null. */
export interface LiveLineupPlayer {
  /** Stable within a lineup: slot plus position in the list. */
  key: string
  slot: string
  name: string
  /** The player's `player_key`: the row's own on a VIP lineup, the matched pool player's on a train; null when neither has one. */
  playerKey: string | null
  /** A locked slot: the player is hidden, so the card shows only the slot and nothing from the pool. */
  locked: boolean
  gameStatus: GameStatus | null
  points: number | null
  projection: number | null
  /** Game clock: the time remaining display, then the raw game status. */
  clock: string | null
  /** The player's game ("MIL@OKC"), from the player pool; null when the pool has no real matchup for them. */
  matchup: string | null
  ownershipPct: number | null
  value: number | null
  /** DraftKings' hot/cold marker; null when the feed sends none. */
  valueIcon: ValueIcon | null
  stats: string | null
}

/** How alike a train's lineups are: every entry shares at least `minShared` of the lineup's `slotCount` slots. */
export interface LiveTrainCloseness {
  minShared: number
  slotCount: number
  /** Every slot is shared. */
  identical: boolean
}

export interface LiveTrainVipOverlap {
  /** The VIP's `LiveVip.key`. */
  key: string
  name: string
  /** Players the VIP's lineup shares with the train's lineup, by name. */
  shared: number
}

export interface LiveTrain {
  id: string
  /** Entries riding this train (v3 `user_count`). */
  entries: number
  /** The best-placed entry's rank. */
  rank: number | null
  /** The train's points (its entries tie on them). */
  points: number | null
  /** The train's PMR (its entries tie on it). */
  pmr: number | null
  lineup: LineupSlot[]
  entryKeys: string[]
  /** The optional per-cluster `min_shared_slots`; null when the producer omits it or sends no whole number. */
  minSharedSlots: number | null
  /** Null unless `minSharedSlots` is known and the train has a lineup. */
  closeness: LiveTrainCloseness | null
  /** The lineup as cards: what a row lacks (game status, points, ownership, value) comes from the player pool, matched by `player_key`, else by name. */
  players: LiveLineupPlayer[]
  /** Display names of the entries riding the train that the standings list, in `entry_keys` order. */
  ridingNames: string[]
  /** One row per VIP, in VIP order. */
  vipOverlaps: LiveTrainVipOverlap[]
}

export interface LiveTrains {
  /** The contest's live metrics update time; null when absent. */
  updatedAt: string | null
  /** The first train's cluster rule; null when none is given. */
  rule: string | null
  /** Best rank first; unranked trains last. */
  rows: LiveTrain[]
}

export interface LiveStandingsRow {
  key: string
  /** Username, then entry key; null when neither is present. */
  name: string | null
  rank: number | null
  points: number | null
  pmr: number | null
  ownershipRemainingPct: number | null
  payoutCents: number | null
  cashing: boolean
}

export interface LiveOwnershipLeader {
  key: string
  /** Display name, then entry key. */
  name: string | null
  ownershipRemainingPct: number | null
  pmr: number | null
  rank: number | null
  points: number | null
}

export interface LiveOwnershipLeaders {
  /** The producer's `top_n_default`, or 10. */
  topN: number
  /** The first `topN` watchlist entries. */
  entries: LiveOwnershipLeader[]
}

export interface LiveSwingPlayer {
  key: string
  name: string
  playerKey: string | null
  ownershipRemainingPct: number | null
  vipCount: number
}

export interface LiveThreat {
  swingPlayers: LiveSwingPlayer[]
}

/**
 * Where a player's game stands right now (the producer's term, distinct from data Status).
 * Null when the feed carries no game status for the player, as for golf.
 */
export type GameStatus = 'pre-game' | 'in-progress' | 'final'

/** One player-ownership-table row: a pool row plus its game status. */
export interface LivePoolPlayer extends PlayerPoolRow {
  gameStatus: GameStatus | null
  /** Indexes into `LiveModel.vips` of the VIPs whose lineup rosters this player, in VIP order. */
  vipIndexes: number[]
}

/**
 * Total ownership: the summed ownership of every player in the pool (about 100% per lineup slot),
 * split by game status. Shares are percentages of `total`; players with no game status count toward
 * `total` but no share.
 */
export interface LiveTotalOwnership {
  total: number
  final: number
  inPlay: number
  preGame: number
  finalShare: number
  inPlayShare: number
  preGameShare: number
}

export interface LiveModel {
  sport: string
  snapshotAt: string
  contest: LiveContestHeader
  /** Entries in the field: `max_entries`; null when the feed gives neither. */
  fieldSize: number | null
  cashLine: LiveCashLine
  vips: LiveVip[]
  /** Relevant players, ordered by ownership then points; search is applied by the view. */
  pool: LivePoolPlayer[]
  /** Computed over the whole pool, before the relevance filter. */
  totalOwnership: LiveTotalOwnership
  /**
   * The field's average ownership remaining per entry: the threat metrics' field remaining figure with its
   * scope, else the ownership leaders total; null when the feed gives neither.
   */
  fieldOwnershipRemaining: LiveFieldRemaining | null
  trains: Section<LiveTrains>
  standings: Section<LiveStandingsRow[]>
  ownershipLeaders: Section<LiveOwnershipLeaders>
  /** Swing players from the threat metrics: the most-owned players whose games are not final. */
  threat: Section<LiveThreat>
}

export type LiveModelResult =
  { kind: 'ready'; model: LiveModel } | { kind: 'not-renderable'; reason: LiveNotRenderableReason }
