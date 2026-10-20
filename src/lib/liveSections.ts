import type { LiveContest as Contest } from './interpretedSnapshot'
import type { LiveFieldRemaining, LiveOwnershipLeaders, LiveStandingsRow, LiveThreat, Section } from './liveModelTypes'
import { numberOrNull } from './playerPool'

export const UNAVAILABLE = { availability: 'unavailable' } as const

export function available<T>(data: T): Section<T> {
  return { availability: 'available', data }
}

/** The threat metrics' contest figure first (captioned by its scope), then the ownership leaders total. */
export function buildFieldRemaining(contest: Contest): LiveFieldRemaining | null {
  const threat = contest.metrics?.threat
  const threatPct = numberOrNull(threat?.field_remaining_pct)
  if (threatPct !== null) return { pct: threatPct, scope: threat?.field_remaining_scope ?? null }
  const leadersPct = numberOrNull(contest.ownership_watchlist?.ownership_remaining_total_pct)
  return leadersPct === null ? null : { pct: leadersPct, scope: null }
}

/**
 * v3 `standings` is a bare array. A present value of any other shape yields no rows.
 * Cashing prefers the emitted `is_cashing`, then `payout_cents` presence.
 */
export function buildStandings(contest: Contest): Section<LiveStandingsRow[]> {
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

export function buildOwnershipLeaders(contest: Contest): Section<LiveOwnershipLeaders> {
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

export function buildThreat(contest: Contest): Section<LiveThreat> {
  const threat = contest.metrics?.threat
  if (!threat) {
    return UNAVAILABLE
  }
  return available({
    swingPlayers: (threat.top_swing_players ?? []).map((player, index) => ({
      key: player.player_key ?? `${player.player_name}-${index}`,
      name: player.player_name,
      playerKey: player.player_key ?? null,
      ownershipRemainingPct: numberOrNull(player.ownership_remaining_pct),
      vipCount: player.vip_count ?? 0,
    })),
  })
}
