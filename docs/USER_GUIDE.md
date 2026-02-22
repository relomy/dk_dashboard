# User Guide

## First-time setup
1. Open the app.
2. Sign in with your dashboard username/password.
3. If prompted, change your temporary password before continuing.

## Main pages
- `Latest`: current snapshot across sports. Use refresh, VIP filter, and drill into sport pages.
- `Live (/live/:sport)`: in-game sweat page for a single sport's primary contest. Prioritizes VIP board + player pool, then ownership/train, with standings kept secondary.
- `Sport`: one sport view with contests grouped by state and player pool search/sort.
- `History`: timeline from manifest metadata; open a timestamp to view that snapshot.
- `Health`: snapshot freshness and per-sport status diagnostics.
- `Settings`: manage local profiles used for VIP lineup filtering.

## Live page behavior
- Resolves one contest per sport using `is_primary` first, then `primary_contest` key/id fallback.
- VIP cashing precedence:
  - use `contest.metrics.distance_to_cash.per_vip` row when present
  - fallback to `payout_cents` presence when no metrics row exists
- Missing sections show unavailable placeholders; present but empty sections show empty-state messaging.
- Runtime fixture contract is envelope-only (`schema_version` + `sports[...]` payload); legacy raw shapes are rejected in contract tests.

## Live page parity panels
- VIP board:
  - distance to cash (points first, rank optional)
  - detailed `players_live` table when present
  - compact slot fallback when player detail rows are missing
- Player pool:
  - columns: `Position`, `Player`, `Team`, `Matchup`, `Salary`, `Own%`, `Points`, `Value`, `Status`
- Threat & leverage:
  - top swing players and VIP-vs-field leverage from metrics
- Ownership remaining:
  - VIP ownership summary cards from `metrics.ownership_summary`
  - watchlist ownership table from `ownership_watchlist`
- Non-cashing info:
  - users not cashing
  - avg PMR remaining
  - top remaining players list with unavailable/empty states
- Train finder:
  - ranked/top cluster rendering from train metrics with show-all toggle

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
- Login errors: verify username/password with your dashboard owner.
- Session expired (401/403): sign in again.
- Snapshot not found in history: timestamp not present in that manifest day.
- Stale/error sport: check `Health` for status and updated time.
