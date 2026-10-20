import { resolveVipCashing } from './contestDisplay'
import type {
  OwnershipSummary as ContestMetricsOwnershipSummary,
  VipLineupRow as VipLineup,
} from './generated/snapshot'
import type { LiveContest as Contest } from './interpretedSnapshot'
import type { LiveTrains, LiveVip, Section } from './liveModelTypes'
import { buildLineupPlayers, projectLineup, type PoolIndex } from './livePlayers'
import { available, UNAVAILABLE } from './liveSections'
import { closestTrain } from './liveTrains'
import { buildPerVipIndex, resolveVipMetricMatchKey } from './perVipKeys'
import { numberOrNull } from './playerPool'

type StandingsRow = Contest['standings'][number]

/** Lineup ownership from the producer's per-VIP summary. */
function lineupOwnershipOf(row: ContestMetricsOwnershipSummary['per_vip'][number] | undefined): number | null {
  return numberOrNull(row?.total_ownership_pct)
}

/** The contest's raw standings rows: v3 `standings` is a bare array, and any other shape has none. */
function standingsRowsOf(contest: Contest): StandingsRow[] {
  const raw: unknown = contest.standings
  return Array.isArray(raw) ? raw.filter((row): row is StandingsRow => Boolean(row && typeof row === 'object')) : []
}

export function buildVips(contest: Contest, trains: Section<LiveTrains>, pool: PoolIndex): LiveVip[] {
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
      key: lineup.entry_key || lineup.vip_entry_key || lineup.display_name || `vip-${vipIndex}`,
      name: lineup.display_name || lineup.entry_key || lineup.vip_entry_key || 'VIP',
      cashing: resolveVipCashing(distance, standing) === true,
      distanceToCash: { points: numberOrNull(distance?.points_delta), rank: numberOrNull(distance?.rank_delta) },
      updatedAt: contest.live_metrics?.updated_at || null,
      rank: numberOrNull(lineup.rank) ?? numberOrNull(standing?.rank),
      points: numberOrNull(lineup.points) ?? numberOrNull(standing?.points),
      projectedPoints: projectLineup(players),
      pmr: numberOrNull(lineup.pmr) ?? numberOrNull(standing?.pmr),
      ownershipRemainingPct:
        numberOrNull(standing?.ownership_remaining_total_pct) ?? numberOrNull(leverage?.vip_remaining_pct),
      lineupOwnershipPct: lineupOwnershipOf(metricKey ? summaryByKey.get(metricKey) : undefined),
      players,
      trainOverlap: closestTrain(trains, vipIndex, lineupSlotCount(lineup)),
      leverage: leverage
        ? available({
            vipRemainingPct: numberOrNull(leverage.vip_remaining_pct),
            fieldRemainingPct: numberOrNull(leverage.field_remaining_pct),
            uniquenessDeltaPct: numberOrNull(leverage.uniqueness_delta_pct),
            partial: leverage.is_partial === true,
          })
        : UNAVAILABLE,
    }
  })
}

/** The producer lineup's size, including locked slots. */
function lineupSlotCount(lineup: VipLineup): number {
  return lineup.players_live?.length ?? 0
}
