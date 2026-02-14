# dk-dashboard

Static React dashboard for viewing DraftKings snapshot data from `dk_results`.

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
  `VITE_MOCK_SNAPSHOT_ONLY=true` and optional `VITE_MOCK_SNAPSHOT_PATH=snapshots/canonical-live-snapshot.json`.
  In this mode, `/api/latest` is synthesized locally and History is disabled with `History requires manifest files.`.

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
- snapshot: `snapshots/canonical-live-snapshot.json`
- manifest: `manifest/2026-02-13.json`

Auth:
- Send `X-Api-Key` header on API requests.
- Client stores key locally/session and never embeds it in build output.

## Cloudflare Pages deploy notes
- Framework: static SPA (no SSR/backend required).
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback is provided by `public/_redirects`:

```txt
/* /index.html 200
```

Ensure your API routes are available at same-origin `/api/*` in production.
