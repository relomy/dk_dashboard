# Operations

## Runtime model
- Static SPA hosted on Cloudflare Pages.
- No server runtime, no database, no SSR.
- Production API target is same-origin `/api/*`.

## Deploy (Cloudflare Pages)
- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: `public/_redirects` contains:

```txt
/* /index.html 200
```

## Environment
- `VITE_API_BASE_URL` (optional): override API base for dev/preview.
- `VITE_USE_MOCK=true` (dev-only): route `/api/*` calls to `public/mock/*` fixtures.

## API assumptions
- `GET /api/latest` returns latest metadata plus manifest paths.
- `GET /api/snapshot?path=...` returns snapshot or manifest JSON by path.
- API requires `X-Api-Key`.

## Validation checklist
Before release:
1. `npm test -- --run`
2. `npm run build`
3. Verify key flows manually:
   - key prompt and key change
   - `/latest` load
   - `/history` list + timestamp route
   - `/health` status visibility

## Operational troubleshooting
- 401/403 errors across routes:
  - likely invalid/expired key.
- History list empty:
  - check `manifest_today_path` from `/api/latest`.
- Snapshot not found for history timestamp:
  - ensure matching `snapshot_at` exists in the UTC-day manifest.
- Stale/error sports:
  - use `Health` view for `updated_at` and error diagnostics.
