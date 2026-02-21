export type SportStatus = 'ok' | 'stale' | 'error'

export type ContestState = 'upcoming' | 'live' | 'completed' | 'cancelled' | 'unknown'

export interface VipLineupSlot {
  slot: string
  player_name: string
  multiplier?: number
}

export interface VipLineupPlayerLive {
  slot: string
  player_name: string
  game_status?: string
  ownership_pct?: number
  salary?: number
  points?: number
  value?: number
  rt_projection?: number
  time_remaining_display?: string
  time_remaining_minutes?: number
  stats_text?: string
}

export interface VipLineup {
  entry_key?: string
  vip_entry_key?: string
  entry_id?: string
  username?: string
  display_name: string
  slots: VipLineupSlot[]
  players_live?: VipLineupPlayerLive[]
  rank?: number
  points?: number
  payout_cents?: number | null
  live?: {
    updated_at: string
    current_points?: number
    current_rank?: number
    // Delta is defined against contest.live_metrics.cash_line.cutoff_type.
    cash_line_delta_points?: number
    is_cashing?: boolean
    payout_cents?: number | null
    ownership_remaining_pct?: number
    pmr?: number
  }
}

export interface ContestMetricsDistanceToCash {
  cutoff_points?: number
  per_vip: Array<{
    vip_entry_key?: string
    entry_key?: string
    display_name?: string
    points_delta?: number
    rank_delta?: number | null
  }>
}

export interface ContestMetricsThreat {
  leverage_semantics: 'positive=unique'
  field_remaining_scope: 'watchlist' | 'contest_field'
  field_remaining_source: 'ownership_watchlist_total' | 'watchlist_entries_sum'
  field_remaining_is_partial?: boolean
  field_remaining_pct?: number | null
  top_swing_players?: Array<{
    player_name: string
    remaining_ownership_pct?: number | null
    vip_count?: number
  }>
  vip_vs_field_leverage?: Array<{
    vip_entry_key?: string
    entry_key?: string
    display_name?: string
    vip_remaining_pct?: number | null
    field_remaining_pct?: number | null
    uniqueness_delta_pct?: number | null
  }>
}

export interface ContestMetricsTrains {
  recommended_top_n: number
  ranked_clusters: Array<{
    cluster_key: string
    rank: number
    entry_count: number
    best_rank?: number
    avg_pmr?: number
  }>
  top_clusters?: Array<{
    cluster_key: string
    rank: number
    entry_count: number
    best_rank?: number
    avg_pmr?: number
  }>
}

export interface ContestMetricsOwnershipSummary {
  source: 'vip_lineup_players'
  scope: 'vip_lineup'
  per_vip: Array<{
    vip_entry_key?: string | null
    entry_key?: string | null
    display_name?: string
    total_ownership_pct?: number
    ownership_in_play_pct?: number
    is_partial?: boolean
  }>
}

export interface ContestMetricsNonCashing {
  users_not_cashing?: number
  avg_pmr_remaining?: number
  top_remaining_players?: Array<{
    player_name: string
    ownership_remaining_pct?: number
  }>
}

export interface ContestMetrics {
  updated_at: string
  distance_to_cash?: ContestMetricsDistanceToCash
  ownership_summary?: ContestMetricsOwnershipSummary
  non_cashing?: ContestMetricsNonCashing
  threat?: ContestMetricsThreat
  trains?: ContestMetricsTrains
}

export interface Contest {
  contest_id: string
  contest_key: string
  is_primary?: boolean
  name: string
  sport: string
  contest_type: string
  start_time: string
  state: ContestState
  completed_at?: string
  entry_fee_cents: number
  prize_pool_cents: number
  currency: string
  entries_count: number
  max_entries: number
  vip_lineups: VipLineup[]
  live_metrics?: {
    updated_at: string
    cash_line?: {
      cutoff_type?: 'points' | 'rank' | 'unknown'
      rank_cutoff?: number
      points_cutoff?: number
    }
  }
  ownership_watchlist?: {
    updated_at: string
    ownership_remaining_total_pct?: number
    top_n_default?: number
    entries: Array<{
      entry_key: string
      display_name?: string
      current_rank?: number
      current_points?: number
      ownership_remaining_pct?: number
      pmr?: number
    }>
  }
  train_clusters?: {
    updated_at: string
    cluster_rule?: {
      type: 'shared_slots'
      min_shared: number
    }
    clusters: Array<{
      cluster_key: string
      entry_count: number
      best_rank?: number
      best_points?: number
      avg_pmr?: number
      avg_ownership_remaining_pct?: number
      composition: VipLineupSlot[]
      sample_entries?: Array<{
        entry_key: string
        display_name?: string
        current_rank?: number
        current_points?: number
        pmr?: number
      }>
    }>
  }
  standings?: {
    updated_at: string
    total_rows?: number
    is_truncated?: boolean
    rows: Array<{
      entry_key: string
      display_name?: string
      rank?: number
      points?: number
      pmr?: number
      payout_cents?: number
      ownership_remaining_pct?: number
    }>
  }
  metrics?: ContestMetrics
}

export interface Player {
  player_id?: string
  name: string
  team: string
  position?: string
  positions?: string[]
  roster_positions?: string[]
  matchup?: string
  salary: number
  status?: string
  game_status?: string
  fantasy_points?: number | null
  value?: number | null
  projected_points?: number | null
  actual_points?: number | null
  ownership_pct?: number | null
}

export interface SportSnapshot {
  status: SportStatus
  updated_at: string
  error?: string
  primary_contest?: {
    contest_id: string
    contest_key: string
    selection_reason: string
    selected_at: string
  }
  contests: Contest[]
  players: Player[]
}

export interface Snapshot {
  schema_version: number
  snapshot_at: string
  generated_at: string
  sports: Record<string, SportSnapshot>
}

export interface LatestResponse {
  latest_snapshot_path: string
  snapshot_at: string
  generated_at: string
  available_sports: string[]
  manifest_today_path: string
  manifest_yesterday_path?: string
}

export interface ManifestSnapshotSummary {
  snapshot_at: string
  path: string
  byte_size?: number
  sports_present: string[]
  contest_counts_by_sport: Record<string, number>
  state_counts: Partial<Record<ContestState, number>>
  sports_status: Record<string, { status: SportStatus; updated_at: string; error?: string }>
}

export interface DayManifest {
  manifest_version: number
  date_utc: string
  generated_at: string
  snapshots: ManifestSnapshotSummary[]
}
