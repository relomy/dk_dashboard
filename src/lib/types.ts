import type {
  Contest as GeneratedContest, SnapshotEnvelope, SportPayload, SportPlayer,
  StandingsRow as GeneratedStanding,
  TrainCluster as GeneratedTrain, OwnershipWatchlist as GeneratedWatchlist,
} from './generated/snapshot'
import type { Status as SportStatus } from './generated/snapshot'
export type {
  Status as SportStatus, PrimaryContest, SelectionReason, ValueIcon, VipLineupRow as VipLineup, VipLineupSlot,
  VipLineupSlot as VipLineupPlayerLive, LiveMetrics, ContestMetrics,
  DistanceToCash as ContestMetricsDistanceToCash, Threat as ContestMetricsThreat,
  OwnershipSummary as ContestMetricsOwnershipSummary, NonCashing as ContestMetricsNonCashing,
} from './generated/snapshot'
/** Dashboard display groups; producer state strings remain open. */
export type ContestState = 'upcoming' | 'live' | 'completed' | 'cancelled' | 'unknown'
/** Base pool fields remain open upstream; declared Scorecard fields come from the producer. */
export interface Player extends SportPlayer {
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
}

/** Open producer sections only; generated closed wrappers preserve required fields. */
export interface StandingsRow extends GeneratedStanding {
  entry_key: string
  username?: string
  rank?: number
  points?: number
  pmr?: number
  payout_cents?: number | null
  ownership_remaining_total_pct?: number
  is_cashing?: boolean
}
export interface TrainCluster extends GeneratedTrain {
  cluster_id: string
  cluster_rule?: string
  user_count: number
  min_shared_slots?: number
  rank?: number
  points?: number
  pmr?: number
  lineup_signature?: string
  entry_keys?: string[]
}
export interface OwnershipWatchlist extends GeneratedWatchlist {
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
export type Contest = Omit<GeneratedContest, 'standings' | 'train_clusters' | 'ownership_watchlist'> & {
  standings: StandingsRow[]
  train_clusters: TrainCluster[]
  ownership_watchlist?: OwnershipWatchlist
}
export type SportSnapshot = Omit<SportPayload, 'players' | 'contests'> & {
  players: Player[]
  contests: Contest[]
}
export type Snapshot = Omit<SnapshotEnvelope, 'sports'> & { sports: Record<string, SportSnapshot> }

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
