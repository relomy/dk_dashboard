export type SportStatus = 'ok' | 'stale' | 'error'

export type ContestState = 'upcoming' | 'live' | 'completed' | 'cancelled' | 'unknown'

export interface VipLineupSlot {
  slot: string
  player_id: string
  multiplier?: number
}

export interface VipLineup {
  vip_entry_key: string
  entry_id?: string
  display_name: string
  slots: VipLineupSlot[]
  rank?: number
  points?: number
  payout_cents?: number
}

export interface Contest {
  contest_id: string
  contest_key: string
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
}

export interface Player {
  player_id: string
  name: string
  team: string
  positions: string[]
  salary: number
  status: string
  projected_points?: number | null
  actual_points?: number | null
  ownership_pct?: number | null
}

export interface SportSnapshot {
  status: SportStatus
  updated_at: string
  error?: string
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
