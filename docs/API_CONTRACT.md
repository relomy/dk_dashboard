# API Contract

This dashboard is a static SPA and reads data from HTTP endpoints only.

## Authentication
- Send `X-Api-Key` on API requests.
- Key is user-provided in the UI and stored client-side (`localStorage` or session storage).
- `401`/`403` should be treated as invalid/expired key.

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
  "latest_snapshot_path": "snapshots/canonical-live-snapshot.json",
  "snapshot_at": "2026-02-13T18:25:00Z",
  "generated_at": "2026-02-13T18:25:07Z",
  "available_sports": ["nba", "nfl"],
  "manifest_today_path": "manifest/2026-02-13.json",
  "manifest_yesterday_path": "manifest/2026-02-12.json"
}
```

## `GET /api/snapshot?path=...`
Returns JSON at the requested storage path. The path may reference either a full snapshot or a manifest.

### Common paths
- Snapshot: `snapshots/canonical-live-snapshot.json`
- Manifest: `manifest/2026-02-13.json`

### Notes
- The app treats timestamps as UTC in transport.
- Historical deep links use timestamp routes and are resolved via UTC-day manifests.

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
- `contest.train_clusters.cluster_rule` (for example `shared_slots` with `min_shared`)
- `contest.train_clusters.clusters[].composition[].player_name` (name-only composition in order)
- `contest.standings.total_rows` and `contest.standings.is_truncated` (optional payload-size escape hatch)
- standings cashing semantics: `standings.rows[].payout_cents` presence implies the row is currently cashing
- vip cashing semantics: `vip_lineups[].payout_cents` presence is the source of truth for cashing

Section presence rules:
- Missing object (`ownership_watchlist`, `train_clusters`, `standings`) => unavailable placeholder.
- Present object with empty arrays => empty state (not unavailable).

## Error behavior expectations
- `401`/`403`: invalid/expired key (no retries).
- Other non-2xx: request error.
- Timeouts/network failures: retryable transient errors.
