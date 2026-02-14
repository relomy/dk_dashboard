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

## Canonical fixtures
- Baseline snapshot fixture: `public/mock/snapshots/canonical-live-snapshot.json`.
- Baseline variant fixtures (edge cases only):
  - `public/mock/snapshots/canonical-live-snapshot-missing-sections.json`
  - `public/mock/snapshots/canonical-live-snapshot-empty-standings.json`
  - `public/mock/snapshots/canonical-live-snapshot-no-primary.json`
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
