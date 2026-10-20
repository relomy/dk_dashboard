import type { LiveContest as Contest } from './interpretedSnapshot'
import { parseLineupSignature, type LineupSlot } from './lineup'
import type {
  LiveLineupPlayer,
  LiveStandingsRow,
  LiveTrain,
  LiveTrainCloseness,
  LiveTrains,
  LiveVipTrainOverlap,
  Section,
} from './liveModelTypes'
import { classifyGameStatus, lineupPlayerNames, matchupOf, nonEmptyString } from './livePlayers'
import { available, UNAVAILABLE } from './liveSections'
import { numberOrNull, readValueIcon } from './playerPool'
import type { Player } from './types'

/** A VIP shares this many players or more with a Train before the VIP view points at it. */
export const TRAIN_NOTICE_MIN_SHARED = 4

/** The train a VIP shares the most players with (ties: the larger train), if that reaches the notice threshold. */
export function closestTrain(
  trains: Section<LiveTrains>,
  vipIndex: number,
  slotCount: number,
): LiveVipTrainOverlap | null {
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
      playerKey: player?.player_key ?? null,
      locked: slot.locked,
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
export function buildTrains(
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
  const vipNames = contest.vip_lineups.map((lineup, index) => ({
    key: lineup.entry_key || lineup.vip_entry_key || lineup.display_name || `vip-${index}`,
    name: lineup.display_name || lineup.entry_key || lineup.vip_entry_key || 'VIP',
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
