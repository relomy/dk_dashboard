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
  "latest_snapshot_path": "snapshots/2026-02-13T18-25-00Z.json",
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
- Snapshot: `snapshots/2026-02-13T18-25-00Z.json`
- Manifest: `manifest/2026-02-13.json`

### Notes
- The app treats timestamps as UTC in transport.
- Historical deep links use timestamp routes and are resolved via UTC-day manifests.

## Error behavior expectations
- `401`/`403`: invalid/expired key (no retries).
- Other non-2xx: request error.
- Timeouts/network failures: retryable transient errors.
