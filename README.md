# dk-dashboard

Static React dashboard for viewing DraftKings snapshot data from `dk_results`.

## Key routes
- `/latest`: cross-sport overview.
- `/live/:sport`: single-sport, primary-contest sweat page (VIP board, ownership remaining, train finder, secondary standings).
- `/sport/:sport`: broader per-sport drilldown across contests.
- `/history` and `/history/:timestamp`: manifest-driven history list and snapshot deep links.
- `/health`: freshness and error diagnostics.
- `/settings`: account info + local profile management.

## Local dev
1. `npm i`
2. `npm run dev`

## Mock mode
Use mock fixtures in `public/mock` during local development:

```bash
VITE_USE_MOCK=true npm run dev
```

Notes:
- Mock mode is dev-only.
- Optional API base override is available for dev/preview: `VITE_API_BASE_URL`.
- Optional snapshot-only helper is available for real-data validation without manifests:
  `VITE_MOCK_SNAPSHOT_ONLY=true` and optional `VITE_MOCK_SNAPSHOT_PATH=snapshots/canonical-live-snapshot.v3.json`.
  In this mode, `/api/latest` is synthesized locally and History is disabled with `History requires manifest files.`.
- In mock mode, auth backend calls are bypassed and the app uses a synthetic local `friend` session.

## Authentication model
- Browser access keys are removed.
- App users authenticate with username/password via same-origin auth endpoints and HttpOnly session cookies.
- Required auth endpoints:
  - `GET /api/auth/csrf`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `POST /api/auth/change-password`
- Session and CSRF checks are enforced on auth/admin POST routes.

## Create First Owner Account
Run this once per environment to create the initial owner login.

```bash
# 1) Apply auth migrations
npm run auth:migrate:remote

# 2) Create owner (prints temporary password)
npm run auth:bootstrap-owner -- --username <owner_username> --remote
```

Then:
1. Sign in at your dashboard URL with the printed temporary password.
2. Complete forced password change.
3. Create friend accounts in `/admin/users`.

If an owner already exists and you need recovery:

```bash
npm run auth:reset-owner-password -- --username <owner_username> --confirm --remote
```

## API contract (`/api/latest`, `/api/snapshot`)
The app expects same-origin endpoints in production.

### `GET /api/latest`
Returns metadata for the latest snapshot and history manifests.
Expected shape (minimum):
- `latest_snapshot_path` (string)
- `snapshot_at` (UTC ISO string)
- `generated_at` (UTC ISO string)
- `available_sports` (string[])
- `manifest_today_path` (string)
- `manifest_yesterday_path` (optional string)

### `GET /api/snapshot?path=...`
Returns JSON content addressed by `path`, for example:
- snapshot: `snapshots/canonical-live-snapshot.v3.json`
- manifest: `manifest/2026-02-13.json`

Error responses for `/api/latest` and `/api/snapshot` use:

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

### Data file placement
The dashboard expects `path` values from `/api/latest` and manifest entries to resolve under one data root:

```txt
<data-root>/
  latest.json
  manifest/
    YYYY-MM-DD.json
  snapshots/
    <snapshot-file>.json
```

- `latest.json.latest_snapshot_path` must match a file under `<data-root>/snapshots`.
- `latest.json.manifest_today_path` and `manifest_yesterday_path` must match files under `<data-root>/manifest`.
- Each manifest entry `snapshots[].path` must point to a real snapshot file under `<data-root>/snapshots`.
- `/api/snapshot?path=...` should treat `path` as a root-relative lookup within this data root.

Auth:
- `/api/latest` and `/api/snapshot` require an authenticated session cookie.
- `401`/`403` should be treated as unauthenticated/expired session.

## Cloudflare Pages deploy notes
- Framework: static SPA + Pages Functions (for `/api/*`).
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback is provided by `public/_redirects`:

```txt
/* /index.html 200
```

Pages Functions runtime requirements:
- R2 binding variable name: `dk_dashboard_data`
- D1 binding variable name: `AUTH_DB`
- Secret: `SESSION_PEPPER` (required)
- Optional: `ALLOWED_ORIGINS` (comma-separated allowlist for state-changing requests)
- Optional legacy key: `DASHBOARD_API_KEY` (not used by app user flows)

Auth posture is fail-closed in deployed environments:
- if `SESSION_PEPPER` is unset/empty, auth/session routes return `500` with `server_misconfigured`.

Ensure same-origin `/api/*` routes are active in production.
