# Snapshot Schema

Current snapshot format uses `schema_version: 3`.

This document describes what the producer emits (dk_results `snapshot_feed.py`, checked against
commit `a04055d`, `src/dk_results/services/snapshot_v3/`). The producer is the source of truth; when
this document and the emitted snapshot disagree, the emitted snapshot wins. A real emitted snapshot
is committed at `public/mock/snapshots/live-2026-10-03T20-48-31Z.json` (provenance in
`public/mock/PRODUCER_FIXTURE.md`).

## Conventions
- IDs are strings (`contest_id`, `contest_key`, `player_key`, `entry_key`, `vip_entry_key`, `cluster_id`).
- All timestamps are UTC ISO strings (`YYYY-MM-DDTHH:MM:SSZ`).
- Money values are integer cents.
- Contest state and sport status are separate concepts.
- Optional values may be present with `null` rather than absent.
- Dashboard contract fixtures are envelope snapshots (`sports[...]`), not legacy/raw sport payload roots.

## Top-level snapshot
```ts
{
  schema_version: 3,
  snapshot_at: string,    // UTC ISO
  generated_at: string,   // UTC ISO, same value as snapshot_at
  sports: Record<string, SportSnapshot> // lowercase sport keys, e.g. "mlb"
}
```

## `SportSnapshot`
```ts
{
  status: 'ok',           // the producer currently only emits 'ok'
  updated_at: string,     // UTC ISO
  primary_contest: {
    contest_id: string,
    contest_key: string,
    selection_reason: {
      mode: string,       // e.g. "explicit_id"
      criteria: Record<string, unknown>,
      selected_from_candidate_count: number,
      tie_breakers: string[]
    },
    selected_at: string   // UTC ISO
  },
  contests: [Contest],    // exactly one contest, the primary contest
  players: Player[]
}
```

## `Contest`
```ts
{
  contest_id: string,
  contest_key: string | null,  // "<sport>:<contest_id>", e.g. "mlb:196293731"
  name: string | null,
  sport: string,
  contest_type: string,        // "classic"
  start_time: string | null,   // UTC ISO
  state: 'upcoming' | 'live' | 'completed' | 'cancelled' | null,
  currency: string,            // "USD"
  entry_fee_cents: number | null,
  prize_pool_cents: number | null,
  max_entries: number | null,
  max_entries_per_user: number | null,
  standings: StandingsRow[],   // capped by the producer's standings limit
  vip_lineups: VipLineup[],
  train_clusters: TrainCluster[],
  ownership_watchlist?: {      // omitted when it has no entries and no total
    ownership_remaining_total_pct?: number,
    entries: Array<{           // top 10 by ownership remaining ("Ownership leaders")
      entry_key: string,
      display_name: string,
      ownership_remaining_pct: number, // lineup total, can exceed 100
      current_rank: number | null,
      current_points: number | null,
      pmr: number | null
    }>
  },
  live_metrics?: {             // omitted when no member is available
    updated_at: string,
    cash_line?: {
      cutoff_type: 'points' | 'rank' | 'unknown',
      rank_cutoff: number | null,
      points_cutoff: number | null
    },
    avg_salary_per_player_remaining?: number // derived from VIP live slots only
  },
  metrics?: {                  // omitted when no member is available
    updated_at: string,
    distance_to_cash?: {
      cutoff_points?: number,
      per_vip: Array<{
        vip_entry_key: string | null,
        entry_key: string | null,
        display_name: string | null,
        points_delta: number,
        rank_delta?: number
      }>
    },
    threat?: {
      top_swing_players: Array<{
        player_key: string,
        player_name: string,
        vip_count: number,
        ownership_remaining_pct?: number
      }>
    }
  }
}
```

## `StandingsRow`
```ts
{
  rank: number | string,       // numeric rank, or the raw value when it cannot be parsed
  entry_key: string,
  username: string,
  points: number | null,
  pmr: number | null,
  payout_cents: number | null,
  is_cashing: boolean,
  ownership_remaining_total_pct: number | null,
  remaining_salary: number,
  is_vip: boolean
}
```

## `TrainCluster`
A train is a group of entries with the same points and PMR that have spent at most the salary limit.
```ts
{
  cluster_id: string,          // 12-char hash of lineup_signature
  cluster_rule: string,        // e.g. "salary_remaining<=40000_and_same_points_pmr"
  user_count: number,          // entries in the train (always > 1)
  rank: number,
  points: number | null,
  pmr: number | null,
  lineup_signature: string,    // player names joined by "|"; hidden slots read "LOCKED 🔒"
  entry_keys: string[]
}
```

Notes:
- Clusters are sorted by `user_count` desc, then `points` desc.
- `lineup_signature` comes from the best-ranked member and can be `""` when no lineup is known.

## `VipLineup`
```ts
{
  display_name?: string,
  entry_key?: string,
  vip_entry_key?: string,
  rank?: number | string,
  pts?: number,
  pmr?: number,
  players_live?: Array<{
    player_name: string,
    player_key?: string,
    salary?: number,
    is_live: boolean
  }>
}
```

Notes:
- Cashing precedence is metrics-first for live UX:
  - if `contest.metrics.distance_to_cash.per_vip` has a row, derive cashing from `points_delta` (fallback `rank_delta`)
  - otherwise fallback to `payout_cents` presence
- For standings rows, prefer the emitted `is_cashing`.

## `Player`
```ts
{
  player_key: string,          // "<sport>:<name>:<team>:<salary>:<position>"
  name: string,
  position: string,
  roster_positions: string[],
  salary: number,
  team: string,
  game_status: string,
  matchup: string,
  ownership_pct: number,       // percent, 0-100
  fantasy_points: number,
  value: number
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

Manifest naming uses UTC dates: `manifest/YYYY-MM-DD.json`. Snapshot rows are sorted newest first.

## Test fixture baseline
- Producer fixtures: `public/mock/snapshots/live-2026-10-04T18-41-34Z.json` (NFL mid-slate with
  VIPs below the standings cut, plus golf), and the older
  `public/mock/snapshots/live-2026-10-03T20-48-31Z.json` with `public/mock/manifest/2026-10-03.json`.
  They are pulled from R2 and trimmed only by dropping array elements
  (`npm run fixture:refresh -- <snapshot key>`). Provenance and trimming are recorded in
  `public/mock/PRODUCER_FIXTURE.md`.
- These are the only committed snapshot fixtures; there are no hand-written fixtures.
- Targeted behavior variants are derived in-test from the producer fixture (missing sections, empty
  standings, missing primary contest, injected VIP lineups and metrics).
- `db_main --snapshot-out` legacy/raw shape is excluded from dashboard fixture-shape gating.
