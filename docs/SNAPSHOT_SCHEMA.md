# Snapshot Schema

Current snapshot format uses `schema_version: 1`.

## Conventions
- All IDs are strings (`contest_id`, `contest_key`, `player_id`, `entry_id`, `vip_entry_key`).
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
  contests: Contest[],
  players: Player[]
}
```

## `Contest`
```ts
{
  contest_id: string,
  contest_key: string,    // stable key, e.g. "nba:1001"
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
  vip_lineups: VipLineup[]
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
  payout_cents?: number
}
```

Notes:
- `slot` values are opaque and must be rendered in provided order.
- `multiplier` is optional; if absent, UI treats as 1.0.

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
