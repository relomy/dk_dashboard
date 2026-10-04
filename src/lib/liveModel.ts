import { parseLineupSignature, type LineupSlot } from './lineup'
import { buildPerVipIndex, resolveVipMetricMatchKey } from './perVipKeys'
import { buildPlayerPool, type PlayerPoolRow } from './playerPool'
import type {
  Contest,
  ContestMetricsDistanceToCash,
  ContestMetricsOwnershipSummary,
  Player,
  Snapshot,
  SportSnapshot,
  VipLineup,
} from './types'

export type LiveNotRenderableReason =
  | { kind: 'sport-missing' }
  | { kind: 'no-primary-contest' }
  | { kind: 'primary-contest-missing'; contestKey: string; contestId: string }

/**
 * A section the feed may omit. A missing object is `unavailable`; a present one is
 * `available`, and a present but empty list inside it is the section's empty state.
 */
export type Section<T> = { status: 'unavailable' } | { status: 'available'; data: T }

const UNAVAILABLE = { status: 'unavailable' } as const

function available<T>(data: T): Section<T> {
  return { status: 'available', data }
}

export interface LiveContestHeader {
  name: string
  contestKey: string
  contestId: string
  /** The producer's selection reason (a string, or the `mode` of the reason object); null when blank. */
  selectionReason: string | null
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
  /** The live block's current rank, then the lineup's rank. */
  rank: number | null
  /** The live block's current points, then the lineup's points. */
  points: number | null
  /** Points if the lineup scores as projected: final points for finished players, else the real-time projection. */
  projectedPoints: number | null
  pmr: number | null
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
  ownershipPct: number | null
  value: number | null
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
  /** The lineup as cards: game status, points and ownership come from the player pool, matched by name. */
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
  totalPct: number | null
  /** The producer's `top_n_default`, or 10. */
  topN: number
  /** The first `topN` watchlist entries. */
  entries: LiveOwnershipLeader[]
}

export interface LiveOwnershipSummaryRow {
  /** The per-VIP metric key the row was matched on. */
  key: string
  name: string
  totalOwnershipPct: number | null
  ownershipInPlayPct: number | null
  partial: boolean
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

export interface LiveLeverageRow {
  key: string
  /** Display name, then entry key. */
  name: string | null
  vipRemainingPct: number | null
  fieldRemainingPct: number | null
  uniquenessDeltaPct: number | null
}

export interface LiveLeverage {
  /** Null when the feed lacks the field total. */
  fieldRemaining: { pct: number; contestField: boolean; partial: boolean } | null
  rows: LiveLeverageRow[]
}

export interface LiveNonCashing {
  entriesNotCashing: number | null
  avgPmrRemaining: number | null
  topRemainingPlayers: Section<Array<{ name: string; ownershipRemainingPct: number | null }>>
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
  trains: Section<LiveTrains>
  standings: Section<LiveStandingsRow[]>
  ownershipLeaders: Section<LiveOwnershipLeaders>
  /** One row per VIP lineup with a matching per-VIP summary row. */
  ownershipSummary: Section<LiveOwnershipSummaryRow[]>
  threat: Section<LiveThreat>
  leverage: Section<LiveLeverage>
  nonCashing: Section<LiveNonCashing>
  avgSalaryPerPlayerRemaining: Section<number>
}

export type LiveModelResult =
  | { kind: 'ready'; model: LiveModel }
  | { kind: 'not-renderable'; reason: LiveNotRenderableReason }

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resolveSelectionReason(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  if (value && typeof value === 'object') {
    const mode = (value as { mode?: unknown }).mode
    if (typeof mode === 'string' && mode.trim()) {
      return mode
    }
  }
  return null
}

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

/**
 * Metrics first: a matched distance-to-cash row decides by points delta, then rank delta.
 * Without one, any payout on the lineup (or its live block) means cashing.
 */
function resolveVipCashing(lineup: VipLineup, distance: DistanceToCashRow | undefined): boolean {
  if (typeof distance?.points_delta === 'number') {
    return distance.points_delta >= 0
  }
  if (typeof distance?.rank_delta === 'number') {
    return distance.rank_delta >= 0
  }
  return lineup.payout_cents != null || lineup.live?.payout_cents != null
}

/** Lineup ownership under either name: `lineup_ownership_pct`, else the older `total_ownership_pct`. */
function lineupOwnershipOf(row: ContestMetricsOwnershipSummary['per_vip'][number] | undefined): number | null {
  return numberOrNull(row?.lineup_ownership_pct) ?? numberOrNull(row?.total_ownership_pct)
}

function buildLineupPlayers(lineup: VipLineup): LiveLineupPlayer[] {
  if (Array.isArray(lineup.players_live)) {
    return lineup.players_live.map((player, index) => ({
      key: `${player.slot}-${index}`,
      slot: player.slot,
      name: player.player_name,
      gameStatus: classifyGameStatus(player.game_status),
      points: numberOrNull(player.points),
      projection: numberOrNull(player.rt_projection),
      clock: nonEmptyString(player.time_remaining_display) ?? nonEmptyString(player.game_status),
      ownershipPct: numberOrNull(player.ownership_pct),
      value: numberOrNull(player.value),
      stats: nonEmptyString(player.stats_text),
    }))
  }
  return (lineup.slots ?? []).map((slot, index) => ({
    key: `${slot.slot}-${index}`,
    slot: slot.slot,
    name: slot.player_name,
    gameStatus: null,
    points: null,
    projection: null,
    clock: null,
    ownershipPct: null,
    value: null,
    stats: null,
  }))
}

/** Final players count their points; the rest count their real-time projection, or the points so far. */
function projectLineup(lineup: VipLineup): number | null {
  const rows = Array.isArray(lineup.players_live) ? lineup.players_live : []
  if (rows.length === 0) return null
  return rows.reduce((sum, row) => {
    const points = numberOrNull(row.points) ?? 0
    const projection = numberOrNull(row.rt_projection)
    return sum + (classifyGameStatus(row.game_status) === 'final' ? points : (projection ?? points))
  }, 0)
}

function buildVips(contest: Contest, trains: Section<LiveTrains>): LiveVip[] {
  const distanceByKey = buildPerVipIndex(contest.metrics?.distance_to_cash?.per_vip ?? [])
  const summaryByKey = buildPerVipIndex(contest.metrics?.ownership_summary?.per_vip ?? [])
  return contest.vip_lineups.map((lineup, vipIndex) => {
    const metricKey = resolveVipMetricMatchKey(lineup)
    const distance = metricKey ? distanceByKey.get(metricKey) : undefined
    return {
      key: lineup.entry_key || lineup.vip_entry_key || lineup.display_name,
      name: lineup.display_name,
      cashing: resolveVipCashing(lineup, distance),
      distanceToCash: { points: numberOrNull(distance?.points_delta), rank: numberOrNull(distance?.rank_delta) },
      updatedAt: lineup.live?.updated_at || null,
      rank: numberOrNull(lineup.live?.current_rank) ?? numberOrNull(lineup.rank),
      points: numberOrNull(lineup.live?.current_points) ?? numberOrNull(lineup.points),
      projectedPoints: projectLineup(lineup),
      pmr: numberOrNull(lineup.live?.pmr),
      ownershipRemainingPct: numberOrNull(lineup.live?.ownership_remaining_pct),
      lineupOwnershipPct: lineupOwnershipOf(metricKey ? summaryByKey.get(metricKey) : undefined),
      players: buildLineupPlayers(lineup),
      trainOverlap: closestTrain(trains, vipIndex, lineupSlotCount(lineup)),
    }
  })
}

function lineupSlotCount(lineup: VipLineup): number {
  return buildLineupPlayers(lineup).length
}

/** The train a VIP shares the most players with (ties: the larger train), if that reaches the notice threshold. */
function closestTrain(trains: Section<LiveTrains>, vipIndex: number, slotCount: number): LiveVipTrainOverlap | null {
  if (trains.status !== 'available') return null
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
      ownershipPct: numberOrNull(player?.ownership_pct),
      value: numberOrNull(player?.value),
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
  sportData: SportSnapshot,
  standings: Section<LiveStandingsRow[]>,
): Section<LiveTrains> {
  const raw: unknown = contest.train_clusters
  if (!Array.isArray(raw)) {
    return UNAVAILABLE
  }

  const poolByName = new Map<string, Player>()
  for (const player of sportData.players) {
    if (!poolByName.has(player.name)) poolByName.set(player.name, player)
  }
  const namesByEntryKey = new Map<string, string>()
  if (standings.status === 'available') {
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

/** "identical" when every slot is shared, else "share N of M"; null when the producer gave no `min_shared_slots`. */
export function trainClosenessLabel(closeness: LiveTrainCloseness | null): string | null {
  if (!closeness) return null
  return closeness.identical ? 'identical' : `share ${closeness.minShared} of ${closeness.slotCount}`
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
    totalPct: numberOrNull(watchlist.ownership_remaining_total_pct),
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

function buildOwnershipSummary(contest: Contest): Section<LiveOwnershipSummaryRow[]> {
  const summary = contest.metrics?.ownership_summary
  if (!summary) {
    return UNAVAILABLE
  }
  const summaryByKey = buildPerVipIndex(summary.per_vip ?? [])
  const rows: LiveOwnershipSummaryRow[] = []
  for (const lineup of contest.vip_lineups) {
    const key = resolveVipMetricMatchKey(lineup)
    const row = key ? summaryByKey.get(key) : undefined
    if (!key || !row) continue
    rows.push({
      key,
      name: lineup.display_name,
      totalOwnershipPct: lineupOwnershipOf(row),
      ownershipInPlayPct: numberOrNull(row.ownership_in_play_pct),
      partial: Boolean(row.is_partial),
    })
  }
  return available(rows)
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

function buildLeverage(contest: Contest): Section<LiveLeverage> {
  const threat = contest.metrics?.threat
  const leverage = threat?.vip_vs_field_leverage
  if (!threat || !leverage) {
    return UNAVAILABLE
  }
  const fieldPct = numberOrNull(threat.field_remaining_pct)
  return available({
    fieldRemaining:
      fieldPct === null
        ? null
        : {
            pct: fieldPct,
            contestField: threat.field_remaining_scope === 'contest_field',
            partial: Boolean(threat.field_remaining_is_partial),
          },
    rows: leverage.map((entry, index) => ({
      key: entry.vip_entry_key ?? entry.entry_key ?? `${entry.display_name}-${index}`,
      name: entry.display_name ?? entry.entry_key ?? null,
      vipRemainingPct: numberOrNull(entry.vip_remaining_pct),
      fieldRemainingPct: numberOrNull(entry.field_remaining_pct),
      uniquenessDeltaPct: numberOrNull(entry.uniqueness_delta_pct),
    })),
  })
}

function buildNonCashing(contest: Contest): Section<LiveNonCashing> {
  const nonCashing = contest.metrics?.non_cashing
  if (!nonCashing) {
    return UNAVAILABLE
  }
  const topRemaining: unknown = nonCashing.top_remaining_players
  return available({
    entriesNotCashing: numberOrNull(nonCashing.users_not_cashing),
    avgPmrRemaining: numberOrNull(nonCashing.avg_pmr_remaining),
    topRemainingPlayers: Array.isArray(topRemaining)
      ? available(
          (topRemaining as NonNullable<typeof nonCashing.top_remaining_players>).map((player) => ({
            name: player.player_name,
            ownershipRemainingPct: numberOrNull(player.ownership_remaining_pct),
          })),
        )
      : UNAVAILABLE,
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

export type LineupOwnershipHint = 'chalky' | 'balanced' | 'contrarian'

/**
 * How chalky a lineup is, from its summed ownership over its slot count (the prototype's thresholds):
 * an average of 50% a slot or more is chalky, 20% or less is contrarian. Null without ownership or slots.
 */
export function lineupOwnershipHint(lineupOwnershipPct: number | null, slotCount: number): LineupOwnershipHint | null {
  if (lineupOwnershipPct === null || slotCount <= 0) return null
  const average = lineupOwnershipPct / slotCount
  if (average >= 50) return 'chalky'
  if (average <= 20) return 'contrarian'
  return 'balanced'
}

export interface LineupGroup {
  gameStatus: GameStatus
  label: 'Playing now' | 'Yet to play' | 'Done'
  players: LiveLineupPlayer[]
}

/**
 * A lineup grouped for display: Playing now (in progress), Yet to play (pre-game, or no game status)
 * and Done (final), in that order and each in lineup order. Empty groups are left out.
 */
export function groupLineup(players: LiveLineupPlayer[]): LineupGroup[] {
  const groups: LineupGroup[] = [
    { gameStatus: 'in-progress', label: 'Playing now', players: [] },
    { gameStatus: 'pre-game', label: 'Yet to play', players: [] },
    { gameStatus: 'final', label: 'Done', players: [] },
  ]
  for (const player of players) {
    const status = player.gameStatus ?? 'pre-game'
    groups.find((group) => group.gameStatus === status)?.players.push(player)
  }
  return groups.filter((group) => group.players.length > 0)
}

function buildAvgSalaryPerPlayerRemaining(contest: Contest): Section<number> {
  const avgSalary = numberOrNull(contest.live_metrics?.avg_salary_per_player_remaining)
  return avgSalary === null ? UNAVAILABLE : available(avgSalary)
}

export type PoolSortKey = 'own' | 'points' | 'value' | 'salary' | 'name'
export type PoolFilter = 'all' | 'still-to-play' | 'on-a-vip'
export interface PoolSort {
  key: PoolSortKey
  dir: 'asc' | 'desc'
}

/** Name sorts A to Z first; the numbers sort highest first. */
export function defaultSortDir(key: PoolSortKey): PoolSort['dir'] {
  return key === 'name' ? 'asc' : 'desc'
}

/** Value is hidden for pre-game players (a zero is not a bust), so it never ranks them. */
export function visibleValue(player: LivePoolPlayer): number | null {
  return player.gameStatus === 'pre-game' ? null : player.value
}

function sortValue(player: LivePoolPlayer, key: PoolSortKey): number | string | null {
  switch (key) {
    case 'own':
      return player.ownershipPct
    case 'points':
      return player.points
    case 'value':
      return visibleValue(player)
    case 'salary':
      return player.salary
    case 'name':
      return player.name
  }
}

/**
 * The Players view's rows: search by player or team, the "Still to play" (game not final)
 * and "On a VIP" filters, then the chosen sort. Missing values sort last in either direction.
 */
export function queryPool(
  pool: LivePoolPlayer[],
  { search, filter, sort }: { search: string; filter: PoolFilter; sort: PoolSort },
): LivePoolPlayer[] {
  const needle = search.trim().toLowerCase()
  const sign = sort.dir === 'asc' ? 1 : -1
  return pool
    .filter((player) => !needle || player.name.toLowerCase().includes(needle) || player.team.toLowerCase().includes(needle))
    .filter((player) => {
      if (filter === 'still-to-play') return player.gameStatus === 'pre-game' || player.gameStatus === 'in-progress'
      if (filter === 'on-a-vip') return player.vipIndexes.length > 0
      return true
    })
    .sort((a, b) => {
      const av = sortValue(a, sort.key)
      const bv = sortValue(b, sort.key)
      if (av === null || bv === null) return (av === null ? 1 : 0) - (bv === null ? 1 : 0)
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * sign
      return (av - bv) * sign
    })
}

export function buildLiveModel(snapshot: Snapshot, sportKey: string): LiveModelResult {
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
    return notRenderable({
      kind: 'primary-contest-missing',
      contestKey: configured.contest_key,
      contestId: configured.contest_id,
    })
  }
  const cashLine = contest.live_metrics?.cash_line
  const standings = buildStandings(contest)
  const trains = buildTrains(contest, sportData, standings)
  return {
    kind: 'ready',
    model: {
      sport: sportKey,
      snapshotAt: snapshot.snapshot_at,
      contest: {
        name: contest.name,
        contestKey: contest.contest_key,
        contestId: contest.contest_id,
        selectionReason: resolveSelectionReason(configured.selection_reason),
      },
      fieldSize: numberOrNull(contest.entries_count) ?? numberOrNull(contest.max_entries),
      cashLine: { points: numberOrNull(cashLine?.points_cutoff), rank: numberOrNull(cashLine?.rank_cutoff) },
      vips: buildVips(contest, trains),
      pool: buildPool(sportData, contest),
      totalOwnership: buildTotalOwnership(sportData.players),
      trains,
      standings,
      ownershipLeaders: buildOwnershipLeaders(contest),
      ownershipSummary: buildOwnershipSummary(contest),
      threat: buildThreat(contest),
      leverage: buildLeverage(contest),
      nonCashing: buildNonCashing(contest),
      avgSalaryPerPlayerRemaining: buildAvgSalaryPerPlayerRemaining(contest),
    },
  }
}
