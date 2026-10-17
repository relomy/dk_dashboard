# User Guide

## First-time setup
1. Open the app.
2. Sign in with your dashboard username/password.
3. If prompted, change your temporary password before continuing.

## Getting an account
- Accounts are created by an owner user.
- If you do not have credentials, ask the dashboard owner to create your user in `/admin/users`.
- Owners are bootstrapped from operations commands; this is not self-service in the UI.

## Main pages
- `Latest`: current snapshot across sports. Use refresh, VIP filter, and drill into sport pages.
- `Live (/live/:sport)`: in-game sweat page for a single sport's primary contest. Prioritizes VIP board + player pool, then ownership/train, with standings kept secondary.
- `Sport`: one sport view with contests grouped by state and player pool search/sort.
- `History`: browsable list of past snapshots from manifest metadata; open a timestamp to view that snapshot. For what changed between snapshots, see the Shifts Timeline below.
- `Shifts (/shifts/:sport)`: owner-only. The Summary tab shows what moved since you last looked; the Timeline tab is a log of the sport's primary contest (see below).
- `Health`: snapshot freshness and per-sport status diagnostics.
- `Settings`: manage local profiles used for VIP lineup filtering.

## Live page behavior
- Resolves one contest per sport using `is_primary` first, then `primary_contest` key/id fallback.
- VIP cashing precedence:
  - use `contest.metrics.distance_to_cash.per_vip` row when present
  - fallback to `payout_cents` presence when no metrics row exists
- Missing sections show unavailable placeholders; present but empty sections show empty-state messaging.
- Runtime fixture contract is envelope-only (`schema_version` + `sports[...]` payload); legacy raw shapes are rejected in contract tests.

## Live page views
- Players (default): the player ownership table with game status, ownership, points, value, DraftKings
  hot/cold markers (only when the feed sends `value_icon`) and the VIPs rostering each player.
- VIPs: rank, points, distance to cash, PMR, ownership remaining, lineup ownership and the grouped lineup.
- Trains: size and closeness, best rank, points, PMR, VIP overlap and the grouped lineup.
- Lineup cards show each player's matchup from the player pool, unless the pool only repeats the game status there.
- Leverage panel (desktop column, tablet below, phone tab):
  - swing players from `metrics.threat.top_swing_players`, marked HAVE/FADE against the focused VIP
    (or the focused Train on the Trains view)
  - leverage vs field: each VIP's ownership remaining against the field average
    (`ownership_watchlist.ownership_remaining_total_pct`)
  - ownership leaders from `ownership_watchlist`: rank, ownership remaining, PMR and points
- A snapshot whose `schema_version` is not 3 shows an unsupported-format message (ADR 0002).

## Shifts Timeline
- Owner-only, like the rest of Shifts: anyone else sees "Shifts are not available". Open the `Timeline` tab on the Shifts page; it has its own address, `/shifts/:sport/timeline`, so you can reload straight into it.
- Nothing is loaded until you open the tab. Opening fetches the newest 5 snapshots of the day (today's History manifest, topped up from yesterday's when today is short) and shows the newest 4 Steps, newest first.
- Each Step is a card on a vertical rail, timestamped with its snapshot time (shown in your local time). It has one row per VIP that shifted between that snapshot and the one before it: the rank, points and distance-to-cash moves, any cash crossing (with the cash line move that caused it) and a collapsed lineup diff you can expand (`Lineup · N of M changed`). A cash line move or a contest state change is listed in its own Step.
- Rows start as your active Profile's VIPs (the VIP filter below). A Profile with no rules follows every VIP.
- The filter bar above the rail is always visible, with no collapsed form. Its strips scroll sideways on a phone. Chips are toggles:
  - VIP: any VIP can be turned on or off. It is left out when your Profile follows a single VIP. It never hides contest-level items (the cash line move, contest state changes and the final standings, which list every VIP with your Profile's VIPs first).
  - Kind: Rank & points, Player events, Cash line, Crossings and Contest state. A kind that is off hides that part of a row.
  - High priority only: shows only cash crossings and contest state changes.
  - Where a row keeps some parts and hides others, a `+N hidden` chip counts the hidden parts and reveals them when tapped. Rows and Steps with nothing left to show disappear. If nothing matches you get "No entries match these filters"; skipped snapshots and their Retry stay on the rail either way.
  - Reset appears in the filter bar only while a filter is off its default. It puts the VIPs back to your Profile, every kind on and High priority only off; Compact stays as it is.
  - The `High` badge on a row shows only while its High part (a cash crossing) is shown.
- Compact shows the same Steps as one short line per change under the Step time, with no per-VIP block or lineup expander. When the contest has completed it adds one line per VIP, such as `Final: You 3rd, cashing`.
- The range meter at the top of the rail shows how many snapshots are loaded out of the cap (`5 of 60 snapshots`) and the progress of a Load more. `Load more` at the tail of the rail adds older Steps; the loaded history ends with a note: `From HH:MM` when the window (today and yesterday) ends, the contest start when an earlier snapshot belongs to another contest, or a note that it stopped at the cap.
- While the Timeline is open, new snapshots join at the top about every five minutes and are announced to screen readers (`New Step at 14:05`). If a refresh fails, a notice says so and the rail stays as it was.
- The tabs follow the usual keyboard pattern: the arrow keys switch between Summary and Timeline, and Space or Enter activates the focused tab.
- Filters and Compact are kept while you switch between the Summary and Timeline tabs and start over when you reload. They are not saved in the address or in browser storage.
- Loading shows progress; if the manifest or the latest snapshot cannot be fetched you get an error with Retry. A snapshot that fails to load or is not fresh is marked on the rail, and the Steps either side are compared across it. Retry on a failed snapshot says "Retry failed" if it still cannot be fetched, and moves focus to the new Step when it works. A sport with no primary contest shows "There is nothing to follow live for this sport." and a rail with nothing to show says "No VIP shifts yet".
- The Timeline never changes your Seen mark; it has no unseen state. A divider reading `Last looked · HH:MM` (with the date when it is an earlier day) shows where your Seen mark falls; if it is older than the loaded range, a note at the tail says `You last looked at HH:MM, earlier than shown`.

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
