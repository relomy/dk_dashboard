import { parseLineupSignature, type LineupSlot } from './lineup'
import { buildPerVipIndex, resolveVipMetricMatchKey } from './perVipKeys'
import { buildPlayerPool, type PlayerPoolRow } from './playerPool'
import type {
  Contest,
  ContestMetricsDistanceToCash,
  Snapshot,
  SportSnapshot,
  VipLineup,
  VipLineupPlayerLive,
  VipLineupSlot,
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
  lineup: LiveVipLineup
}

/**
 * A present `players_live` list (even an empty one) is the lineup detail;
 * when it is missing the name-only slots stand in.
 */
export type LiveVipLineup =
  | { kind: 'players-live'; players: VipLineupPlayerLive[] }
  | { kind: 'slots'; slots: VipLineupSlot[] }

export interface LiveTrain {
  id: string
  /** Entries riding this train (v3 `user_count`). */
  entries: number
  rank: number | null
  points: number | null
  pmr: number | null
  lineup: LineupSlot[]
  entryKeys: string[]
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

export interface LiveModel {
  sport: string
  snapshotAt: string
  contest: LiveContestHeader
  cashLine: LiveCashLine
  vips: LiveVip[]
  /** Relevant players, ordered by ownership then points; search is applied by the view. */
  pool: PlayerPoolRow[]
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
function resolvePrimaryContest(
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

function buildVips(contest: Contest): LiveVip[] {
  const distanceByKey = buildPerVipIndex(contest.metrics?.distance_to_cash?.per_vip ?? [])
  return contest.vip_lineups.map((lineup) => {
    const metricKey = resolveVipMetricMatchKey(lineup)
    const distance = metricKey ? distanceByKey.get(metricKey) : undefined
    return {
      key: lineup.entry_key || lineup.vip_entry_key || lineup.display_name,
      name: lineup.display_name,
      cashing: resolveVipCashing(lineup, distance),
      distanceToCash: { points: numberOrNull(distance?.points_delta), rank: numberOrNull(distance?.rank_delta) },
      updatedAt: lineup.live?.updated_at || null,
      lineup: Array.isArray(lineup.players_live)
        ? { kind: 'players-live', players: lineup.players_live }
        : { kind: 'slots', slots: lineup.slots },
    }
  })
}

/**
 * v3 `train_clusters` is a bare array. Rows without a string `cluster_id` and numeric `user_count`
 * are malformed and dropped; a non-empty list with no valid rows is treated as unavailable.
 */
function buildTrains(contest: Contest): Section<LiveTrains> {
  const raw: unknown = contest.train_clusters
  if (!Array.isArray(raw)) {
    return UNAVAILABLE
  }

  let rule: string | null = null
  const rows: LiveTrain[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = nonEmptyString(row.cluster_id)
    if (!id || typeof row.user_count !== 'number') continue

    rule ??= nonEmptyString(row.cluster_rule)
    rows.push({
      id,
      entries: row.user_count,
      rank: numberOrNull(row.rank),
      points: numberOrNull(row.points),
      pmr: numberOrNull(row.pmr),
      lineup: parseLineupSignature(typeof row.lineup_signature === 'string' ? row.lineup_signature : null),
      entryKeys: Array.isArray(row.entry_keys)
        ? row.entry_keys.filter((key): key is string => typeof key === 'string')
        : [],
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
      totalOwnershipPct: numberOrNull(row.total_ownership_pct),
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

function buildAvgSalaryPerPlayerRemaining(contest: Contest): Section<number> {
  const avgSalary = numberOrNull(contest.live_metrics?.avg_salary_per_player_remaining)
  return avgSalary === null ? UNAVAILABLE : available(avgSalary)
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
      cashLine: { points: numberOrNull(cashLine?.points_cutoff), rank: numberOrNull(cashLine?.rank_cutoff) },
      vips: buildVips(contest),
      pool: buildPlayerPool(sportData.players, ''),
      trains: buildTrains(contest),
      standings: buildStandings(contest),
      ownershipLeaders: buildOwnershipLeaders(contest),
      ownershipSummary: buildOwnershipSummary(contest),
      threat: buildThreat(contest),
      leverage: buildLeverage(contest),
      nonCashing: buildNonCashing(contest),
      avgSalaryPerPlayerRemaining: buildAvgSalaryPerPlayerRemaining(contest),
    },
  }
}
