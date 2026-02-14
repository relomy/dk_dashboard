# Snapshot Schema

Current snapshot format uses `schema_version: 1`.

## Conventions
- All IDs are strings (`contest_id`, `contest_key`, `player_id`, `entry_id`, `vip_entry_key`, `entry_key`).
- All timestamps are UTC ISO strings.
- Money values are integer cents.
- Contest state and sport status are separate concepts.

## Top-level snapshot
```ts
{
  schema_version: number, // currently 1
  snapshot_at: string,    // UTC ISO
  generated_at: string,   // UTC ISO
  sports: Record<string, SportSnapshot>
}
```

## `SportSnapshot`
```ts
{
  status: 'ok' | 'stale' | 'error',
  updated_at: string,     // UTC ISO
  error?: string,
  primary_contest?: {
    contest_id: string,
    contest_key: string,
    selection_reason: string,
    selected_at: string    // UTC ISO
  },
  contests: Contest[],
  players: Player[]
}
```

## `Contest`
```ts
{
  contest_id: string,
  contest_key: string,    // stable key, e.g. "nba:1001"
  is_primary?: boolean,   // true on the selected primary contest
  name: string,
  sport: string,
  contest_type: string,
  start_time: string,     // UTC ISO
  state: 'upcoming' | 'live' | 'completed' | 'cancelled' | 'unknown',
  completed_at?: string,  // UTC ISO
  entry_fee_cents: number,
  prize_pool_cents: number,
  currency: string,       // e.g. "USD"
  entries_count: number,
  max_entries: number,
  vip_lineups: VipLineup[],
  live_metrics?: {
    updated_at: string,
    cash_line?: {
      cutoff_type?: 'points' | 'rank' | 'unknown',
      rank_cutoff?: number,
      points_cutoff?: number
    }
  },
  ownership_watchlist?: {
    updated_at: string,
    ownership_remaining_total_pct?: number,
    top_n_default?: number,
    entries: Array<{
      entry_key: string,
      display_name?: string,
      current_rank?: number,
      current_points?: number,
      ownership_remaining_pct?: number,
      pmr?: number
    }>
  },
  train_clusters?: {
    updated_at: string,
    cluster_rule?: {
      type: 'shared_slots',
      min_shared: number
    },
    clusters: Array<{
      cluster_key: string,
      entry_count: number,
      best_rank?: number,
      best_points?: number,
      avg_pmr?: number,
      avg_ownership_remaining_pct?: number,
      composition: Array<{ slot: string; player_id: string; multiplier?: number }>,
      sample_entries?: Array<{
        entry_key: string,
        display_name?: string,
        current_rank?: number,
        current_points?: number,
        pmr?: number
      }>
    }>
  },
  standings?: {
    updated_at: string,
    total_rows?: number,
    is_truncated?: boolean,
    rows: Array<{
      entry_key: string,
      display_name?: string,
      rank?: number,
      points?: number,
      pmr?: number,
      payout_cents?: number,
      ownership_remaining_pct?: number
    }>
  }
}
```

## `VipLineup`
```ts
{
  vip_entry_key: string,
  entry_id?: string,
  username?: string,
  display_name: string,
  slots: Array<{ slot: string; player_id: string; multiplier?: number }>,
  rank?: number,
  points?: number,
  payout_cents?: number,
  live?: {
    updated_at: string,
    current_points?: number,
    current_rank?: number,
    cash_line_delta_points?: number,
    is_cashing?: boolean,
    ownership_remaining_pct?: number,
    pmr?: number
  }
}
```

Notes:
- `slot` values are opaque and must be rendered in provided order.
- `multiplier` is optional; if absent, UI treats as 1.0.
- `cash_line_delta_points` is interpreted against `contest.live_metrics.cash_line.cutoff_type`.
- For standings rows, `payout_cents` presence implies the row is currently cashing.

## `Player`
```ts
{
  player_id: string,
  name: string,
  team: string,
  positions: string[],
  salary: number,
  status: string,
  projected_points?: number | null,
  actual_points?: number | null,
  ownership_pct?: number | null
}
```

## Day manifest schema
```ts
{
  manifest_version: number,
  date_utc: string, // YYYY-MM-DD (UTC day)
  generated_at: string,
  snapshots: Array<{
    snapshot_at: string,
    path: string,
    byte_size?: number,
    sports_present: string[],
    contest_counts_by_sport: Record<string, number>,
    state_counts: Partial<Record<'upcoming' | 'live' | 'completed' | 'cancelled' | 'unknown', number>>,
    sports_status: Record<string, { status: 'ok' | 'stale' | 'error'; updated_at: string; error?: string }>
  }>
}
```

Manifest naming uses UTC dates: `manifest/YYYY-MM-DD.json`.
