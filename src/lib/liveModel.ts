import { parseLineupSignature, type LineupSlot } from './lineup'
import { buildPerVipIndex, resolveVipMetricMatchKey } from './perVipKeys'
import { buildPlayerPool, numberOrNull, readValueIcon, type PlayerPoolRow } from './playerPool'
import type {
  Contest,
  ContestMetricsDistanceToCash,
  ContestMetricsOwnershipSummary,
  Player,
  Snapshot,
  SportSnapshot,
  ValueIcon,
  VipLineup,
  VipLineupPlayerLive,
} from './types'

export type LiveNotRenderableReason =
  | { kind: 'unsupported-schema'; version: number | null }
  | { kind: 'sport-missing' }
  | { kind: 'no-primary-contest' }
  | { kind: 'primary-contest-missing' }

/**
 * A section the feed may omit. A missing object is `unavailable`; a present one is
 * `available`, and a present but empty list inside it is the section's empty state.
 * The discriminant is `availability`, not `status`: Status means data freshness (CONTEXT.md).
 */
export type Section<T> = { availability: 'unavailable' } | { availability: 'available'; data: T }

const UNAVAILABLE = { availability: 'unavailable' } as const

function available<T>(data: T): Section<T> {
  return { availability: 'available', data }
}

export interface LiveContestHeader {
  name: string
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
  /** The VIP's live block update time; null when absent. */
  updatedAt: string | null
  /** The live block's current rank, then the lineup's rank, then the standings row's. */
  rank: number | null
  /** The live block's current points, then the lineup's `points` or `pts`, then the standings row's. */
  points: number | null
  /** Points if the lineup scores as projected: final points for finished players, else the real-time projection. */
  projectedPoints: number | null
  /** The live block's PMR, then the lineup's, then the standings row's. */
  pmr: number | null
  /** The live block's, then the standings row's, then the VIP's `vip_vs_field_leverage` row's `vip_remaining_pct`. */
  ownershipRemainingPct: number | null
  /**
   * Lineup ownership: the summed ownership of the lineup's players, from the per-VIP ownership
   * summary as `lineup_ownership_pct`, or `total_ownership_pct` before the rename.
   */
  lineupOwnershipPct: number | null
  /** A present `players_live` list (even an empty one) is the lineup; when it is missing the name-only slots stand in. */
  players: LiveLineupPlayer[]
  /** The train this VIP's lineup shares the most players with, when that is at least `TRAIN_NOTICE_MIN_SHARED`. */
  trainOverlap: LiveVipTrainOverlap | null
}

/** A VIP shares this many players or more with a Train before the VIP view points at it. */
export const TRAIN_NOTICE_MIN_SHARED = 4

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
  /** Entries in the field: `entries_count`, else `max_entries`; null when the feed gives neither. */
  fieldSize: number | null
  cashLine: LiveCashLine
  vips: LiveVip[]
  /** Relevant players, ordered by ownership then points; search is applied by the view. */
  pool: LivePoolPlayer[]
  /** Computed over the whole pool, before the relevance filter. */
  totalOwnership: LiveTotalOwnership
  /**
   * The field's average ownership remaining per entry: the ownership leaders total (the producer averages
   * every standings row), else the threat metrics' field remaining figure; null when the feed gives neither.
   */
  fieldOwnershipRemainingPct: number | null
  trains: Section<LiveTrains>
  standings: Section<LiveStandingsRow[]>
  ownershipLeaders: Section<LiveOwnershipLeaders>
  /** Swing players from the threat metrics: the most-owned players whose games are not final. */
  threat: Section<LiveThreat>
}

export type LiveModelResult =
  | { kind: 'ready'; model: LiveModel }
  | { kind: 'not-renderable'; reason: LiveNotRenderableReason }

function notRenderable(reason: LiveNotRenderableReason): LiveModelResult {
  return { kind: 'not-renderable', reason }
}

/** `is_primary` wins; otherwise match the configured primary contest by key, then by id. */
export function resolvePrimaryContest(
  contests: Contest[],
  configured: NonNullable<SportSnapshot['primary_contest']>,
): Contest | null {
  return (
    contests.find((contest) => contest.is_primary === true) ??
    contests.find((contest) => contest.contest_key === configured.contest_key) ??
    contests.find((contest) => contest.contest_id === configured.contest_id) ??
    null
  )
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

type DistanceToCashRow = ContestMetricsDistanceToCash['per_vip'][number]
type StandingsRow = NonNullable<Contest['standings']>[number]

/**
 * Metrics first: a matched distance-to-cash row decides by points delta, then rank delta.
 * Without one, any payout on the lineup (or its live block) means cashing, then the standings row decides.
 */
function resolveVipCashing(
  lineup: VipLineup,
  distance: DistanceToCashRow | undefined,
  standing: StandingsRow | undefined,
): boolean {
  if (typeof distance?.points_delta === 'number') {
    return distance.points_delta >= 0
  }
  if (typeof distance?.rank_delta === 'number') {
    return distance.rank_delta >= 0
  }
  if (lineup.payout_cents != null || lineup.live?.payout_cents != null) {
    return true
  }
  return standing?.is_cashing === true
}

/** Lineup ownership under either name: `lineup_ownership_pct`, else the older `total_ownership_pct`. */
function lineupOwnershipOf(row: ContestMetricsOwnershipSummary['per_vip'][number] | undefined): number | null {
  return numberOrNull(row?.lineup_ownership_pct) ?? numberOrNull(row?.total_ownership_pct)
}

/** The player pool keyed by `keyOf`; the first row wins when a key repeats. */
function indexPool(players: Player[], keyOf: (player: Player) => string | undefined): Map<string, Player> {
  const index = new Map<string, Player>()
  for (const player of players) {
    const key = keyOf(player)
    if (key && !index.has(key)) index.set(key, player)
  }
  return index
}

interface PoolIndex {
  byName: Map<string, Player>
  byKey: Map<string, Player>
}

/**
 * The pool player behind a `players_live` row. A locked row has none. A row with a `player_key` matches by key
 * alone: a key the pool lacks is a miss, not a reason to guess by name. Only a keyless row matches by name.
 */
function poolPlayerOf(row: VipLineupPlayerLive, pool: PoolIndex): Player | undefined {
  if (row.is_locked) return undefined
  if (row.player_key) return pool.byKey.get(row.player_key)
  return pool.byName.get(row.player_name)
}

/**
 * A pool player's matchup ("MIL@OKC"). Null when the feed sends the game status in its place
 * (today's producer copies `game_status` into `matchup`), so the card does not repeat it.
 */
function matchupOf(player: Player | undefined): string | null {
  const matchup = nonEmptyString(player?.matchup)
  if (!matchup) return null
  return matchup.trim().toLowerCase() === player?.game_status?.trim().toLowerCase() ? null : matchup
}

/** Fields on the row itself come first; the pool player fills in what the row lacks. */
function buildLineupPlayers(lineup: VipLineup, pool: PoolIndex): LiveLineupPlayer[] {
  if (Array.isArray(lineup.players_live)) {
    return lineup.players_live.map((player, index) => {
      const pooled = poolPlayerOf(player, pool)
      const gameStatus = player.game_status ?? pooled?.game_status
      return {
        key: `${player.slot ?? 'row'}-${index}`,
        slot: player.slot ?? '',
        name: player.player_name,
        gameStatus: classifyGameStatus(gameStatus),
        points: numberOrNull(player.points) ?? numberOrNull(pooled?.fantasy_points),
        projection: numberOrNull(player.rt_projection),
        clock: nonEmptyString(player.time_remaining_display) ?? nonEmptyString(gameStatus),
        matchup: matchupOf(pooled),
        ownershipPct: numberOrNull(player.ownership_pct) ?? numberOrNull(pooled?.ownership_pct),
        value: numberOrNull(player.value) ?? numberOrNull(pooled?.value),
        valueIcon: readValueIcon(player.value_icon),
        stats: nonEmptyString(player.stats_text),
      }
    })
  }
  return (lineup.slots ?? []).map((slot, index) => ({
    key: `${slot.slot}-${index}`,
    slot: slot.slot,
    name: slot.player_name,
    gameStatus: null,
    points: null,
    projection: null,
    clock: null,
    matchup: matchupOf(pool.byName.get(slot.player_name)),
    ownershipPct: null,
    value: null,
    valueIcon: null,
    stats: null,
  }))
}

/**
 * Final players count their points; the rest count their real-time projection, or the points so far.
 * Null when no player carries a projection: the sum would only repeat the points already scored.
 */
function projectLineup(players: LiveLineupPlayer[]): number | null {
  if (!players.some((player) => player.projection !== null)) return null
  return players.reduce((sum, player) => {
    const points = player.points ?? 0
    return sum + (player.gameStatus === 'final' ? points : (player.projection ?? points))
  }, 0)
}

/**
 * A figure on the VIP's lineup row: a finite number, or a numeric string as the producer sends
 * `rank` and `pmr` (`"879"`). Anything else (blank, junk, absent) is null.
 */
function lineupFigure(value: unknown): number | null {
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value)
  return numberOrNull(value)
}

/** The contest's raw standings rows: v3 `standings` is a bare array, and any other shape has none. */
function standingsRowsOf(contest: Contest): StandingsRow[] {
  const raw: unknown = contest.standings
  return Array.isArray(raw) ? raw.filter((row): row is StandingsRow => Boolean(row && typeof row === 'object')) : []
}

function buildVips(contest: Contest, trains: Section<LiveTrains>, pool: PoolIndex): LiveVip[] {
  const standingsByKey = buildPerVipIndex(standingsRowsOf(contest))
  const distanceByKey = buildPerVipIndex(contest.metrics?.distance_to_cash?.per_vip ?? [])
  const summaryByKey = buildPerVipIndex(contest.metrics?.ownership_summary?.per_vip ?? [])
  const leverageByKey = buildPerVipIndex(contest.metrics?.threat?.vip_vs_field_leverage ?? [])
  return contest.vip_lineups.map((lineup, vipIndex) => {
    const metricKey = resolveVipMetricMatchKey(lineup)
    const distance = metricKey ? distanceByKey.get(metricKey) : undefined
    const standing = metricKey ? standingsByKey.get(metricKey) : undefined
    const leverage = metricKey ? leverageByKey.get(metricKey) : undefined
    const players = buildLineupPlayers(lineup, pool)
    return {
      key: lineup.entry_key || lineup.vip_entry_key || lineup.display_name,
      name: lineup.display_name,
      cashing: resolveVipCashing(lineup, distance, standing),
      distanceToCash: { points: numberOrNull(distance?.points_delta), rank: numberOrNull(distance?.rank_delta) },
      updatedAt: lineup.live?.updated_at || null,
      rank: numberOrNull(lineup.live?.current_rank) ?? lineupFigure(lineup.rank) ?? numberOrNull(standing?.rank),
      points:
        numberOrNull(lineup.live?.current_points) ??
        lineupFigure(lineup.points) ??
        lineupFigure(lineup.pts) ??
        numberOrNull(standing?.points),
      projectedPoints: projectLineup(players),
      pmr: numberOrNull(lineup.live?.pmr) ?? lineupFigure(lineup.pmr) ?? numberOrNull(standing?.pmr),
      ownershipRemainingPct:
        numberOrNull(lineup.live?.ownership_remaining_pct) ??
        numberOrNull(standing?.ownership_remaining_total_pct) ??
        numberOrNull(leverage?.vip_remaining_pct),
      lineupOwnershipPct: lineupOwnershipOf(metricKey ? summaryByKey.get(metricKey) : undefined),
      players,
      trainOverlap: closestTrain(trains, vipIndex, lineupSlotCount(lineup)),
    }
  })
}

/** The lineup's size, counted as `buildLineupPlayers` would list it: `players_live` when present, else the slots. */
function lineupSlotCount(lineup: VipLineup): number {
  return Array.isArray(lineup.players_live) ? lineup.players_live.length : (lineup.slots ?? []).length
}

/** The train a VIP shares the most players with (ties: the larger train), if that reaches the notice threshold. */
function closestTrain(trains: Section<LiveTrains>, vipIndex: number, slotCount: number): LiveVipTrainOverlap | null {
  if (trains.availability !== 'available') return null
  let best: { train: LiveTrain; shared: number } | null = null
  for (const train of trains.data.rows) {
    const shared = train.vipOverlaps[vipIndex]?.shared ?? 0
    if (!best || shared > best.shared || (shared === best.shared && train.entries > best.train.entries)) {
      best = { train, shared }
    }
  }
  if (!best || best.shared < TRAIN_NOTICE_MIN_SHARED) return null
  return { trainId: best.train.id, entries: best.train.entries, rank: best.train.rank, shared: best.shared, slotCount }
}

/** A train's lineup as cards. Pool rows supply status, points and ownership; a name the pool lacks has none. */
function buildTrainPlayers(lineup: LineupSlot[], poolByName: Map<string, Player>): LiveLineupPlayer[] {
  return lineup.map((slot, index) => {
    const player = slot.locked ? undefined : poolByName.get(slot.label)
    return {
      key: `${index}-${slot.label}`,
      slot: player ? (player.position ?? player.roster_positions?.join('/') ?? '') : '',
      name: slot.label,
      gameStatus: classifyGameStatus(player?.game_status),
      points: numberOrNull(player?.fantasy_points),
      projection: null,
      clock: nonEmptyString(player?.game_status),
      matchup: matchupOf(player),
      ownershipPct: numberOrNull(player?.ownership_pct),
      value: numberOrNull(player?.value),
      valueIcon: readValueIcon(player?.value_icon),
      stats: null,
    }
  })
}

function buildTrainCloseness(minShared: number | null, slotCount: number): LiveTrainCloseness | null {
  if (minShared === null || slotCount === 0) return null
  return { minShared, slotCount, identical: minShared >= slotCount }
}

/**
 * v3 `train_clusters` is a bare array. Rows without a string `cluster_id` and numeric `user_count`
 * are malformed and dropped; a non-empty list with no valid rows is treated as unavailable.
 */
function buildTrains(
  contest: Contest,
  poolByName: Map<string, Player>,
  standings: Section<LiveStandingsRow[]>,
): Section<LiveTrains> {
  const raw: unknown = contest.train_clusters
  if (!Array.isArray(raw)) {
    return UNAVAILABLE
  }

  const namesByEntryKey = new Map<string, string>()
  if (standings.availability === 'available') {
    for (const row of standings.data) {
      if (row.name !== null) namesByEntryKey.set(row.key, row.name)
    }
  }
  const vipNames = contest.vip_lineups.map((lineup) => ({
    key: lineup.entry_key || lineup.vip_entry_key || lineup.display_name,
    name: lineup.display_name,
    players: lineupPlayerNames(lineup),
  }))

  let rule: string | null = null
  const rows: LiveTrain[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = nonEmptyString(row.cluster_id)
    if (!id || typeof row.user_count !== 'number') continue

    rule ??= nonEmptyString(row.cluster_rule)
    const lineup = parseLineupSignature(typeof row.lineup_signature === 'string' ? row.lineup_signature : null)
    const entryKeys = Array.isArray(row.entry_keys)
      ? row.entry_keys.filter((key): key is string => typeof key === 'string')
      : []
    const minSharedSlots = Number.isInteger(row.min_shared_slots) ? (row.min_shared_slots as number) : null
    const trainNames = new Set(lineup.filter((slot) => !slot.locked).map((slot) => slot.label))
    rows.push({
      id,
      entries: row.user_count,
      rank: numberOrNull(row.rank),
      points: numberOrNull(row.points),
      pmr: numberOrNull(row.pmr),
      lineup,
      entryKeys,
      minSharedSlots,
      closeness: buildTrainCloseness(minSharedSlots, lineup.length),
      players: buildTrainPlayers(lineup, poolByName),
      ridingNames: entryKeys.flatMap((key) => {
        const name = namesByEntryKey.get(key)
        return name === undefined ? [] : [name]
      }),
      vipOverlaps: vipNames.map((vip) => ({
        key: vip.key,
        name: vip.name,
        shared: [...vip.players].filter((name) => trainNames.has(name)).length,
      })),
    })
  }

  if (raw.length > 0 && rows.length === 0) {
    return UNAVAILABLE
  }

  rows.sort((a, b) => {
    if (a.rank === null || b.rank === null) {
      return (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0)
    }
    return a.rank - b.rank
  })

  return available({ updatedAt: contest.live_metrics?.updated_at || null, rule, rows })
}

/** The `count` largest trains: most entries first, then best rank (unranked last). */
export function largestTrains(rows: LiveTrain[], count: number): LiveTrain[] {
  return [...rows]
    .sort((a, b) => {
      if (a.entries !== b.entries) return b.entries - a.entries
      if (a.rank === null || b.rank === null) return (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0)
      return a.rank - b.rank
    })
    .slice(0, count)
}

/**
 * v3 `standings` is a bare array. A present value of any other shape yields no rows.
 * Cashing prefers the emitted `is_cashing`, then `payout_cents` presence.
 */
function buildStandings(contest: Contest): Section<LiveStandingsRow[]> {
  const raw: unknown = contest.standings
  if (!raw) {
    return UNAVAILABLE
  }
  if (!Array.isArray(raw)) {
    return available([])
  }

  return available(
    raw
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
      .map((row, index) => {
        const name = row.username ?? row.entry_key
        return {
          key: String(row.entry_key ?? `standings-${String(row.rank ?? 'row')}-${index}`),
          name: name == null ? null : String(name),
          rank: numberOrNull(row.rank),
          points: numberOrNull(row.points),
          pmr: numberOrNull(row.pmr),
          ownershipRemainingPct: numberOrNull(row.ownership_remaining_total_pct),
          payoutCents: numberOrNull(row.payout_cents),
          cashing: typeof row.is_cashing === 'boolean' ? row.is_cashing : row.payout_cents != null,
        }
      }),
  )
}

function buildOwnershipLeaders(contest: Contest): Section<LiveOwnershipLeaders> {
  const watchlist = contest.ownership_watchlist
  if (!watchlist) {
    return UNAVAILABLE
  }
  const topN = watchlist.top_n_default ?? 10
  return available({
    topN,
    entries: watchlist.entries.slice(0, Math.max(0, topN)).map((entry, index) => ({
      key: entry.entry_key || `watch-${index}`,
      name: entry.display_name ?? entry.entry_key ?? null,
      ownershipRemainingPct: numberOrNull(entry.ownership_remaining_pct),
      pmr: numberOrNull(entry.pmr),
      rank: numberOrNull(entry.current_rank),
      points: numberOrNull(entry.current_points),
    })),
  })
}

function buildThreat(contest: Contest): Section<LiveThreat> {
  const threat = contest.metrics?.threat
  if (!threat) {
    return UNAVAILABLE
  }
  return available({
    swingPlayers: (threat.top_swing_players ?? []).map((player, index) => ({
      key: player.player_key ?? `${player.player_name}-${index}`,
      name: player.player_name,
      ownershipRemainingPct: numberOrNull(player.ownership_remaining_pct ?? player.remaining_ownership_pct),
      vipCount: player.vip_count ?? 0,
    })),
  })
}

const IN_PROGRESS_STATUSES = new Set(['in-progress', 'in progress', 'delayed', 'suspended'])
const FINAL_STATUSES = new Set(['final', 'postponed', 'cancelled', 'canceled'])

/**
 * The feed's `game_status` is DraftKings' game info: a matchup with a start time ("FSU@MIZZ 07:30PM ET")
 * before the game, then a word once it starts. A paused game (Delayed, Suspended) is still in progress;
 * a game moved off the slate or called off (Postponed, Cancelled) counts as final, alongside Final.
 * Anything else, such as golf's tournament name, has no game status.
 */
export function classifyGameStatus(raw: string | null | undefined): GameStatus | null {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!text) return null
  if (FINAL_STATUSES.has(text)) return 'final'
  if (IN_PROGRESS_STATUSES.has(text)) return 'in-progress'
  if (text.includes('@')) return 'pre-game'
  return null
}

/** The player names on a VIP's lineup: its slots plus any `players_live` rows. VIP slots carry names only. */
function lineupPlayerNames(lineup: VipLineup): Set<string> {
  const names = new Set<string>()
  for (const slot of lineup.slots ?? []) names.add(slot.player_name)
  for (const player of Array.isArray(lineup.players_live) ? lineup.players_live : []) names.add(player.player_name)
  return names
}

function buildPool(sportData: SportSnapshot, contest: Contest): LivePoolPlayer[] {
  const lineups = contest.vip_lineups.map(lineupPlayerNames)
  return buildPlayerPool(sportData.players, '').map((row) => ({
    ...row,
    gameStatus: classifyGameStatus(row.status),
    vipIndexes: lineups.flatMap((names, index) => (names.has(row.name) ? [index] : [])),
  }))
}

function buildTotalOwnership(players: Player[]): LiveTotalOwnership {
  const sums = { total: 0, final: 0, inPlay: 0, preGame: 0 }
  for (const player of players) {
    const own = numberOrNull(player.ownership_pct) ?? 0
    sums.total += own
    const status = classifyGameStatus(player.game_status)
    if (status === 'final') sums.final += own
    else if (status === 'in-progress') sums.inPlay += own
    else if (status === 'pre-game') sums.preGame += own
  }
  const share = (part: number) => (sums.total > 0 ? (part / sums.total) * 100 : 0)
  return {
    ...sums,
    finalShare: share(sums.final),
    inPlayShare: share(sums.inPlay),
    preGameShare: share(sums.preGame),
  }
}

/** The only snapshot schema the dashboard reads (ADR 0002). */
export const SUPPORTED_SCHEMA_VERSION = 3

export function buildLiveModel(snapshot: Snapshot, sportKey: string): LiveModelResult {
  if (snapshot.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return notRenderable({ kind: 'unsupported-schema', version: numberOrNull(snapshot.schema_version) })
  }
  const sportData = snapshot.sports[sportKey]
  if (!sportData) {
    return notRenderable({ kind: 'sport-missing' })
  }
  const configured = sportData.primary_contest
  if (!configured) {
    return notRenderable({ kind: 'no-primary-contest' })
  }
  const contest = resolvePrimaryContest(sportData.contests, configured)
  if (!contest) {
    return notRenderable({ kind: 'primary-contest-missing' })
  }
  const cashLine = contest.live_metrics?.cash_line
  const standings = buildStandings(contest)
  const pool = {
    byName: indexPool(sportData.players, (player) => player.name),
    byKey: indexPool(sportData.players, (player) => player.player_key),
  }
  const trains = buildTrains(contest, pool.byName, standings)
  return {
    kind: 'ready',
    model: {
      sport: sportKey,
      snapshotAt: snapshot.snapshot_at,
      contest: { name: contest.name },
      fieldSize: numberOrNull(contest.entries_count) ?? numberOrNull(contest.max_entries),
      cashLine: { points: numberOrNull(cashLine?.points_cutoff), rank: numberOrNull(cashLine?.rank_cutoff) },
      vips: buildVips(contest, trains, pool),
      pool: buildPool(sportData, contest),
      totalOwnership: buildTotalOwnership(sportData.players),
      fieldOwnershipRemainingPct:
        numberOrNull(contest.ownership_watchlist?.ownership_remaining_total_pct) ??
        numberOrNull(contest.metrics?.threat?.field_remaining_pct),
      trains,
      standings,
      ownershipLeaders: buildOwnershipLeaders(contest),
      threat: buildThreat(contest),
    },
  }
}
