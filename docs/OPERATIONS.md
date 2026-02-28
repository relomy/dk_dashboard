# Operations

## Runtime model
- Static SPA hosted on Cloudflare Pages.
- Pages Functions serve same-origin `/api/latest` and `/api/snapshot`.
- Production API target is same-origin `/api/*`.

## Deploy (Cloudflare Pages)
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: `public/_redirects` contains:

```txt
/* /index.html 200
```

Pages Functions runtime configuration:
- Add R2 binding `dk_dashboard_data` (bucket: `dk-dashboard-data`).
- Add D1 binding `AUTH_DB`.
- Add secret `SESSION_PEPPER` (required).
- Optional: `ALLOWED_ORIGINS` (comma-separated allowlist for state-changing routes).
- Optional legacy secret `DASHBOARD_API_KEY` (no longer required for app user flows).
- API/auth fail-closed behavior: if `SESSION_PEPPER` is missing, auth/session endpoints return:
  - `500` JSON error envelope with `error.code = "server_misconfigured"`.

## Environment
- `VITE_API_BASE_URL` (optional): override API base for dev/preview.
- `VITE_USE_MOCK=true` (dev-only): route `/api/*` calls to `public/mock/*` fixtures.
- `VITE_MOCK_SNAPSHOT_ONLY=true` (dev-only, optional): synthesize `/api/latest` locally and point directly to one snapshot.
- `VITE_MOCK_SNAPSHOT_PATH` (dev-only, optional): snapshot path used by snapshot-only mode.

## Account bootstrap and recovery
Use these commands from the `dk_dashboard` repo root.

### First owner account (production/remote D1)
```bash
npm run auth:migrate:remote
npm run auth:bootstrap-owner -- --username <owner_username> --remote
```

Expected output includes a temporary password. Use it once to sign in, then complete forced password change.

### Owner password recovery (production/remote D1)
```bash
npm run auth:reset-owner-password -- --username <owner_username> --confirm --remote
```

This rotates the owner password to a new temporary value and revokes existing sessions for that owner.

### Local reset for clean-room testing
```bash
npm run auth:reset-local -- --username <owner_username>
```

This wipes local auth tables and reseeds one owner with a temporary password.

## Canonical fixtures
- Baseline snapshot fixture: `public/mock/snapshots/canonical-live-snapshot.v3.json`.
- Baseline variant fixtures (edge cases only):
  - `public/mock/snapshots/canonical-live-snapshot.v3-missing-metrics.json`
- In mock mode, `public/mock/latest.json` and `public/mock/manifest/2026-02-13.json` should point to the canonical baseline fixture by default.
- Route tests should use the baseline fixture unless they are explicitly testing one of the edge-case variants above.

### Fixture-change guardrails
- Keep fixture names contract-oriented (avoid version/date-coupled names for the canonical baseline).
- Keep variant fixtures as minimal deltas from the canonical baseline; do not fork unrelated fields.
- Do not add compatibility adapters in the UI for fixture drift. If the contract changes, update UI expectations and fixtures directly.
- Preserve section semantics in tests and fixtures:
  - missing object => unavailable placeholder
  - present object with empty rows/list => empty state
- Preserve cashing semantics:
  - `vip_lineups[].payout_cents` presence is source of truth for VIP cashing
  - `standings.rows[].payout_cents` presence implies cashing

## API assumptions
- `GET /api/latest` returns latest metadata plus manifest paths.
- `GET /api/snapshot?path=...` returns snapshot or manifest JSON by path.
- Both endpoints require an authenticated session cookie.
- Error format for `400/401/404/500`:

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

## Snapshot file placement
For API-backed environments, store dashboard data in a single root directory:

```txt
<data-root>/
  latest.json
  manifest/
    YYYY-MM-DD.json
  snapshots/
    <snapshot-file>.json
```

Path mapping rules:
- `latest.json.latest_snapshot_path` must be a root-relative path into `snapshots/`.
- `latest.json.manifest_today_path` and optional `manifest_yesterday_path` must be root-relative paths into `manifest/`.
- Manifest entries `snapshots[].path` must be root-relative paths into `snapshots/`.
- `GET /api/snapshot?path=...` should read `<data-root>/<path>` (with standard path traversal protections).

Example:
- `latest_snapshot_path = "snapshots/live-2026-02-15T01-30-00Z.json"`
- `manifest_today_path = "manifest/2026-02-15.json"`
- manifest entry `path = "snapshots/live-2026-02-15T01-30-00Z.json"`

For dev mock mode, this same shape lives under `public/mock`:
- `public/mock/latest.json`
- `public/mock/manifest/YYYY-MM-DD.json`
- `public/mock/snapshots/*.json`

## R2 data publish (remote)
Upload the dashboard data root to the remote bucket with `--remote`:

```bash
ROOT=/tmp/dashboard-data
BUCKET=dk-dashboard-data

find "$ROOT" -type f -name '*.json' | while read -r f; do
  key="${f#$ROOT/}"
  npx wrangler r2 object put "$BUCKET/$key" \
    --file "$f" \
    --content-type application/json \
    --remote
done
```

Notes:
- `--remote` is required to publish to the actual Cloudflare bucket.
- Wrangler must have `CLOUDFLARE_API_TOKEN` set in non-interactive environments.

## Validation checklist
Before release:
1. `npm test -- --run`
2. `npm run build`
3. Verify key flows manually:
   - first owner bootstrap and login
   - login and logout
   - forced password change flow
   - owner admin user operations and owner-safety constraints
   - `/latest` load
   - `/live/:sport` load (primary contest resolution + VIP/ownership/train/standings section states)
   - `/history` list + timestamp route
   - `/health` status visibility

## Snapshot v3 cutover
- Production contract assumes canonical `schema_version: 3` snapshot artifacts only.
- No UI compatibility layer should be added for older snapshot shapes.
- Mock baseline is:
  - `public/mock/snapshots/canonical-live-snapshot.v3.json`
- Mock edge-case baseline is:
  - `public/mock/snapshots/canonical-live-snapshot.v3-missing-metrics.json`

Release gate:
1. `GET /api/latest` returns a `latest_snapshot_path` under `snapshots/`
2. `GET /api/snapshot?path=<latest_snapshot_path>` returns a valid v3 envelope
3. manifest entry path(s) resolve through `/api/snapshot?path=...`
4. `/latest`, `/live/:sport`, `/sport/:sport`, `/history`, and `/health` all load against the published artifact set

## Rollback triggers
Rollback immediately if:
- `/api/latest` points to a missing snapshot path
- `/api/snapshot?path=...` returns `404` for current latest or manifest path
- `/latest` or `/live/:sport` fails to render against the latest published snapshot
- history timestamp resolution fails because manifest pathing is wrong
- a published snapshot is not a valid v3 envelope

## Rollback procedure
Dashboard rollback is data-first:

1. Repoint `latest.json` and the current manifest entry to the last known good snapshot artifact from `dk_results`.
2. Republish the data root to R2.
3. Re-run API smoke checks:
   - `/api/latest`
   - `/api/snapshot?path=manifest/YYYY-MM-DD.json`
   - `/api/snapshot?path=snapshots/<latest>.json`
4. Verify `/latest` and `/live/:sport` in the deployed app.

If the regression is code, revert the dashboard cutover commit(s), redeploy Pages, and repeat the API/UI smoke checks.

## Operational troubleshooting
- 401/403 errors across routes:
  - likely missing/expired session; log in again.
- `500 server_misconfigured` on auth/session routes:
  - verify `SESSION_PEPPER` is configured in Pages environment.
- History list empty:
  - check `manifest_today_path` from `/api/latest`.
- Snapshot not found for history timestamp:
  - ensure matching `snapshot_at` exists in the UTC-day manifest.
- Stale/error sports:
  - use `Health` view for `updated_at` and error diagnostics.
- Live route shows "Primary contest is not configured":
  - exporter snapshot is missing `sports[sport].primary_contest` for that sport.
- Live route shows "Primary contest data is missing":
  - `primary_contest` exists but no contest in `sports[sport].contests` matches `is_primary`/key/id.

## API smoke checks
Verify deployed endpoints after data publish:

```bash
PAGES_DOMAIN="https://<your-pages-domain>"
COOKIE_JAR="/tmp/dk-dashboard-cookies.txt"

# 1) Bootstrap CSRF + cookie jar
CSRF_TOKEN=$(curl -sS -c "$COOKIE_JAR" "$PAGES_DOMAIN/api/auth/csrf" | jq -r '.csrf_token')

# 2) Login (sets session cookie)
curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -X POST "$PAGES_DOMAIN/api/auth/login" \
  --data "{\"username\":\"<username>\",\"password\":\"<password>\",\"csrf_token\":\"$CSRF_TOKEN\"}"

# 3) Authenticated data endpoints
curl -sS -b "$COOKIE_JAR" "$PAGES_DOMAIN/api/latest"
curl -sS -b "$COOKIE_JAR" "$PAGES_DOMAIN/api/snapshot?path=manifest/YYYY-MM-DD.json"
curl -sS -b "$COOKIE_JAR" "$PAGES_DOMAIN/api/snapshot?path=snapshots/<latest>.json"
```
