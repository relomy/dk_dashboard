# API Contract

This dashboard is a static SPA and reads data from HTTP endpoints only.

## Authentication
- `/api/latest` and `/api/snapshot` require an authenticated session cookie.
- Session auth is established through `/api/auth/*` endpoints (`csrf`, `login`, `me`, `logout`, `change-password`).
- `401`/`403` should be treated as unauthenticated/expired session.

## `GET /api/latest`
Returns metadata for the current snapshot and history manifests.

### Required fields
- `latest_snapshot_path` (string)
- `snapshot_at` (UTC ISO string)
- `generated_at` (UTC ISO string)
- `available_sports` (string[])
- `manifest_today_path` (string)

### Optional fields
- `manifest_yesterday_path` (string)

### Example
```json
{
  "latest_snapshot_path": "snapshots/live-2026-10-03T20-48-31Z.json",
  "snapshot_at": "2026-10-03T20:48:31Z",
  "generated_at": "2026-10-03T20:48:31Z",
  "available_sports": ["cfb", "golf", "mlb"],
  "manifest_today_path": "manifest/2026-10-03.json",
  "manifest_yesterday_path": "manifest/2026-10-02.json"
}
```

## `GET /api/snapshot?path=...`
Returns JSON at the requested storage path. The path may reference either a full snapshot or a manifest.

### Common paths
- Snapshot: `snapshots/live-2026-10-03T20-48-31Z.json`
- Manifest: `manifest/2026-10-03.json`

### Notes
- The app treats timestamps as UTC in transport.
- Historical deep links use timestamp routes and are resolved via UTC-day manifests.

### Dashboard Contract Fixture Lock (Stage 0)
- Dashboard runtime/fixture contract is the snapshot envelope shape (`schema_version`, `snapshot_at`, `generated_at`, `sports[...]`).
- Contract fixtures for tests should come from `export_snapshot`/`export_fixture` envelope outputs.
- Legacy/raw payloads (for example `db_main --snapshot-out` root `contest`/`selection` shape) are out of scope for dashboard contract gating.

## Snapshot contract additions for `/live/:sport`
The selected contest is explicitly identified per sport:
- `sports[sport].primary_contest.contest_id`
- `sports[sport].primary_contest.contest_key`
- `sports[sport].primary_contest.selection_reason`
- `sports[sport].primary_contest.selected_at`

Contest-scoped live payload is expected on the selected contest:
- `contest.is_primary` set to `true`
- `contest.live_metrics.cash_line.cutoff_type`
- `vip_lineup.live.cash_line_delta_points` aligned to that cutoff definition
- `vip_lineup.slots[].player_name` (name-only slots in order)
- `contest.ownership_watchlist.ownership_remaining_total_pct`
- `contest.ownership_watchlist.top_n_default`
- `contest.train_clusters[]` (bare array; `cluster_rule`, `user_count`, `rank`, `points`, `pmr`, `lineup_signature`)
- `contest.standings[]` (bare array; `payout_cents` presence implies cashing when no metrics-derived status is available)
- vip cashing semantics (authoritative): derive from `contest.metrics.distance_to_cash.per_vip` when present; fallback to `payout_cents` presence only when metrics are unavailable

Section presence rules:
- Missing object (`ownership_watchlist`, `train_clusters`, `standings`) => unavailable placeholder.
- Present object with empty arrays => empty state (not unavailable).

## Error behavior expectations
- `401`/`403`: unauthenticated/expired session (no retries).
- Other non-2xx: request error.
- Timeouts/network failures: retryable transient errors.
