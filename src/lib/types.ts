export type SportStatus = 'ok' | 'stale' | 'error'

export type ContestState = 'upcoming' | 'live' | 'completed' | 'cancelled' | 'unknown'

/** DraftKings' hot (`fire`) or cold (`ice`) value marker; optional until relomy/dk_results#165 ships. */
export type ValueIcon = 'fire' | 'ice'

export interface VipLineupSlot {
  slot: string
  player_name: string
  multiplier?: number
}

export interface VipLineupPlayerLive {
  /** Missing from the producer's rows until relomy/dk_results#174 ships. */
  slot?: string
  /** Matches `Player.player_key`; absent on locked rows. */
  player_key?: string
  player_name: string
  is_locked?: boolean
  game_status?: string
  ownership_pct?: number
  salary?: number
  points?: number
  value?: number
  rt_projection?: number
  time_remaining_display?: string
  time_remaining_minutes?: number
  stats_text?: string
  value_icon?: ValueIcon | null
}

export interface VipLineup {
  entry_key?: string
  vip_entry_key?: string
  entry_id?: string
  username?: string
  display_name: string
  /** The producer sends `players_live` only. */
  slots?: VipLineupSlot[]
  players_live?: VipLineupPlayerLive[]
  /** The producer sends rank and PMR as strings; numeric strings are read as numbers. */
  rank?: number | string
  points?: number
  pts?: number
  pmr?: number | string
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
    player_key?: string
    player_name: string
    ownership_remaining_pct?: number | null
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

export interface ContestMetricsOwnershipSummary {
  source: 'vip_lineup_players'
  scope: 'vip_lineup'
  per_vip: Array<{
    vip_entry_key?: string | null
    entry_key?: string | null
    display_name?: string
    /** Lineup ownership under its current name; `dk_results` is renaming it (relomy/dk_results#165). */
    lineup_ownership_pct?: number
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
  entries_count?: number
  max_entries: number
  max_entries_per_user?: number
  vip_lineups: VipLineup[]
  live_metrics?: {
    updated_at: string
    avg_salary_per_player_remaining?: number
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
  train_clusters?: Array<{
    cluster_id: string
    cluster_rule?: string
    user_count: number
    /**
     * Optional (relomy/dk_results#165): the fewest lineup slots any two entries in the train share.
     * Without it the dashboard shows the train's size only.
     */
    min_shared_slots?: number
    rank?: number
    points?: number
    pmr?: number
    lineup_signature?: string
    entry_keys?: string[]
  }>
  standings?: Array<{
    entry_key: string
    username?: string
    rank?: number
    points?: number
    pmr?: number
    payout_cents?: number | null
    ownership_remaining_total_pct?: number
    is_cashing?: boolean
  }>
  metrics?: ContestMetrics
}

export interface Player {
  player_key?: string
  name: string
  team: string
  position?: string
  roster_positions?: string[]
  matchup?: string
  salary: number
  game_status?: string
  fantasy_points?: number | null
  value?: number | null
  ownership_pct?: number | null
  value_icon?: ValueIcon | null
}

export interface SportSnapshot {
  status: SportStatus
  updated_at: string
  error?: string
  primary_contest?: {
    contest_id: string
    contest_key: string
    selection_reason: string | { mode?: string; [key: string]: unknown }
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

export type AuthRole = 'owner' | 'friend'

export interface AuthUser {
  id: string
  username: string
  role: AuthRole
  must_change_password: boolean
}

export interface AdminUser {
  id: string
  username: string
  role: AuthRole
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null
}
