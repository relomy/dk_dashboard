// PROTOTYPE — throwaway. Flattens a snapshot into a view model the Live variants share.
// Data derivation only; each variant owns its own layout.
import type { Snapshot, VipLineup } from '@/lib/types'

export type GamePhase = 'final' | 'live' | 'pre'

export type LivePlayer = {
  slot: string
  name: string
  phase: GamePhase
  clock: string
  points: number
  proj: number | null
  own: number | null
  salary: number | null
  minsLeft: number | null
  stats: string
  value: number | null
}

export type PoolPlayer = {
  name: string
  pos: string
  team: string
  matchup: string
  salary: number
  own: number
  points: number
  value: number
  phase: GamePhase
  clock: string
  vipIdx: number[]
}

export type LiveVip = {
  key: string
  name: string
  rank: number | null
  points: number
  pmr: number | null
  cashing: boolean
  delta: number | null
  ownLeft: number | null
  projected: number
  totalSalary: number
  players: LivePlayer[]
}

export type StandingRow = {
  key: string
  name: string
  rank: number
  points: number
  pmr: number | null
  ownLeft: number | null
  cashing: boolean
  vip: boolean
}

export type LiveModel = {
  sport: string
  sports: string[]
  contestName: string
  state: string
  entryFee: number
  prizePool: number
  fieldSize: number
  positionsPaid: number | null
  snapshotAt: string
  cashPoints: number | null
  cashRank: number | null
  vips: LiveVip[]
  standings: StandingRow[]
  swing: Array<{ name: string; ownLeft: number; vipCount: number }>
  leaders: Array<{ name: string; rank: number | null; points: number | null; ownLeft: number | null; pmr: number | null }>
  fieldOwnLeft: number | null
  notCashing: number | null
  avgPmrNotCashing: number | null
  trains: Array<{
    key: string
    entries: number
    bestRank: number | null
    bestPoints: number | null
    avgPmr: number | null
    players: string[]
    lineup: LivePlayer[]
    samples: string[]
  }>
  pool: PoolPlayer[]
  maxPmr: number
}

export function phaseOf(status: string | undefined): GamePhase {
  const s = (status ?? '').toLowerCase()
  if (s.startsWith('final')) return 'final'
  if (!s || s.includes('scheduled') || s.includes('pm') || s.includes('am') || s.includes('pre')) return 'pre'
  return 'live'
}

function vipKey(v: VipLineup) {
  return v.entry_key || v.vip_entry_key || v.display_name
}

export function buildLiveModel(snapshot: Snapshot, sport: string): LiveModel | null {
  const sportData = snapshot.sports[sport]
  if (!sportData) return null
  const contest =
    sportData.contests.find((c) => c.is_primary) ??
    sportData.contests.find((c) => c.contest_key === sportData.primary_contest?.contest_key)
  if (!contest) return null

  const distance = new Map((contest.metrics?.distance_to_cash?.per_vip ?? []).map((e) => [e.entry_key, e]))
  const cashPoints = contest.live_metrics?.cash_line?.points_cutoff ?? null
  const rawStandings = Array.isArray(contest.standings) ? contest.standings : (contest.standings?.rows ?? [])
  const cashRank = contest.live_metrics?.cash_line?.rank_cutoff ?? (contest as { positions_paid?: number }).positions_paid ?? null
  const vipKeys = new Set(contest.vip_lineups.map(vipKey))

  const vips: LiveVip[] = contest.vip_lineups.map((v) => {
    const players: LivePlayer[] = (v.players_live ?? []).map((p) => ({
      slot: p.slot,
      name: p.player_name,
      phase: phaseOf(p.game_status),
      clock: p.time_remaining_display ?? p.game_status ?? '',
      points: p.points ?? 0,
      proj: p.rt_projection ?? null,
      own: p.ownership_pct ?? null,
      salary: p.salary ?? null,
      minsLeft: p.time_remaining_minutes ?? null,
      stats: p.stats_text ?? '',
      value: p.value ?? null,
    }))
    const d = distance.get(v.entry_key)
    const points = v.live?.current_points ?? players.reduce((s, p) => s + p.points, 0)
    const delta = d?.points_delta ?? v.live?.cash_line_delta_points ?? (cashPoints != null ? points - cashPoints : null)
    return {
      key: vipKey(v),
      name: v.display_name,
      rank: v.live?.current_rank ?? v.rank ?? null,
      points,
      pmr: v.live?.pmr ?? null,
      cashing: delta != null ? delta >= 0 : Boolean(v.live?.is_cashing),
      delta,
      ownLeft: v.live?.ownership_remaining_pct ?? null,
      totalSalary: players.reduce((s, p) => s + (p.salary ?? 0), 0),
      projected: players.reduce((s, p) => s + (p.phase === 'final' ? p.points : (p.proj ?? p.points)), 0),
      players,
    }
  })

  const standings: StandingRow[] = rawStandings.map((r, i) => ({
    key: r.entry_key,
    name: r.display_name ?? r.username ?? r.entry_key,
    rank: r.rank ?? i + 1,
    points: r.points ?? 0,
    pmr: r.pmr ?? null,
    ownLeft: r.ownership_remaining_pct ?? null,
    cashing: r.payout_cents != null,
    vip: vipKeys.has(r.entry_key),
  }))

  // Player pool lookup so train compositions (names only) can show live game state.
  const pool = new Map(sportData.players.map((p) => [p.name, p]))
  const poolPlayer = (name: string): LivePlayer => {
    const p = pool.get(name)
    const phase = phaseOf(p?.game_status)
    return {
      slot: p?.position ?? '',
      name,
      phase,
      clock: phase === 'final' ? 'Final' : (p?.game_status ?? ''),
      points: p?.fantasy_points ?? 0,
      proj: null,
      own: p?.ownership_pct ?? null,
      salary: p?.salary ?? null,
      minsLeft: null,
      stats: p?.matchup ?? '',
      value: p?.value ?? null,
    }
  }

  const clusters = !Array.isArray(contest.train_clusters) ? (contest.train_clusters?.clusters ?? []) : []
  const metrics = contest.metrics

  return {
    sport,
    sports: Object.keys(snapshot.sports),
    contestName: contest.name,
    state: contest.state,
    entryFee: contest.entry_fee_cents / 100,
    prizePool: contest.prize_pool_cents / 100,
    fieldSize: contest.entries_count ?? standings.length ?? contest.max_entries,
    positionsPaid: cashRank,
    snapshotAt: snapshot.snapshot_at,
    cashPoints,
    cashRank,
    vips,
    standings,
    swing: (metrics?.threat?.top_swing_players ?? []).map((p) => ({
      name: p.player_name,
      ownLeft: p.ownership_remaining_pct ?? p.remaining_ownership_pct ?? 0,
      vipCount: p.vip_count ?? 0,
    })),
    leaders: (contest.ownership_watchlist?.entries ?? []).slice(0, 10).map((e) => ({
      name: e.display_name ?? e.entry_key,
      rank: e.current_rank ?? null,
      points: e.current_points ?? null,
      ownLeft: e.ownership_remaining_pct ?? null,
      pmr: e.pmr ?? null,
    })),
    fieldOwnLeft: metrics?.threat?.field_remaining_pct ?? null,
    notCashing: metrics?.non_cashing?.users_not_cashing ?? null,
    avgPmrNotCashing: metrics?.non_cashing?.avg_pmr_remaining ?? null,
    trains: [...clusters]
      .sort((a, b) => b.entry_count - a.entry_count)
      .slice(0, 6)
      .map((c) => ({
        key: c.cluster_key,
        entries: c.entry_count,
        bestRank: c.best_rank ?? null,
        bestPoints: c.best_points ?? null,
        avgPmr: c.avg_pmr ?? null,
        players: c.composition.map((s) => s.player_name),
        lineup: c.composition.map((s) => poolPlayer(s.player_name)),
        samples: (c.sample_entries ?? []).map((e) => e.display_name ?? e.entry_key),
      })),
    pool: sportData.players
      .filter((p) => (p.ownership_pct ?? 0) > 0 || (p.fantasy_points ?? 0) > 0)
      .map((p) => {
        const phase = phaseOf(p.game_status)
        return {
          name: p.name,
          pos: p.position ?? p.roster_positions?.join('/') ?? '',
          team: p.team,
          matchup: p.matchup ?? '',
          salary: p.salary,
          own: p.ownership_pct ?? 0,
          points: p.fantasy_points ?? p.actual_points ?? 0,
          value: p.value ?? 0,
          phase,
          clock: phase === 'final' ? 'Final' : phase === 'pre' ? 'Not started' : (p.game_status ?? ''),
          vipIdx: vips.flatMap((v, i) => (v.players.some((vp) => vp.name === p.name) ? [i] : [])),
        }
      }),
    maxPmr: sport === 'nba' ? 8 * 48 : 100,
  }
}

export const fmt = {
  pts: (n: number | null | undefined) => (n == null ? '—' : (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '')),
  signed: (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${fmt.pts(n)}`),
  pct: (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`),
  money: (n: number) => `$${Math.round(n).toLocaleString()}`,
  ordinal: (n: number | null) => {
    if (n == null) return '—'
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
  },
  inOut: (n: number | null | undefined) => (n == null ? '—' : `${fmt.pts(Math.abs(n))} pts ${n >= 0 ? 'in' : 'out'}`),
  time: (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
}

// Sheet-style hot/cold marker. Thresholds are per-$1k value; prototype guesses, NBA-ish.
export function heat(value: number | null | undefined, phase: GamePhase): '🔥' | '🧊' | '' {
  if (value == null || phase === 'pre') return ''
  if (value >= 6) return '🔥'
  if (value < 2.5 && phase === 'final') return '🧊'
  return ''
}
