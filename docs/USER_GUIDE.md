# User Guide

## First-time setup
1. Open the app.
2. Enter your access key.
3. Choose storage mode:
   - local (persistent)
   - session only
4. Save key.

## Main pages
- `Latest`: current snapshot across sports. Use refresh, VIP filter, and drill into sport pages.
- `Sport`: one sport view with contests grouped by state and player pool search/sort.
- `History`: timeline from manifest metadata; open a timestamp to view that snapshot.
- `Health`: snapshot freshness and per-sport status diagnostics.
- `Settings`: manage local profiles used for VIP lineup filtering.

## Profiles and VIP filtering
- Create multiple named profiles in `Settings`.
- Rules (optional):
  - `contains`
  - `exact`
  - `username`
- Matching is OR-based: any configured rule match includes the lineup.
- In Latest/Sport pages, switch between:
  - `All VIPs`
  - `Active profile only`

## History deep links
- History snapshot routes are timestamp-based (URL-safe), for example:
  - `/history/2026-02-13T18-25-00Z`
- The app resolves this via the UTC-day manifest and exact `snapshot_at` match.

## Common troubleshooting
- Invalid key errors: use `Change key` and re-enter a valid key.
- Snapshot not found in history: timestamp not present in that manifest day.
- Stale/error sport: check `Health` for status and updated time.
