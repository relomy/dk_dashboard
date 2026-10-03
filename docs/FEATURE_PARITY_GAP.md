# Dashboard Feature Parity Gap

Date: 2026-02-21
Scope: Google-sheet parity tranche for `Live` route using schema v3 metrics and additive VIP/player fields.

## Baseline
- `dk_results/docs/dk-results-feature-spec.md`
- `dk_results/docs/google-sheet-feature-set-and-parity.md`

## Runtime Contract Lock
- Dashboard runtime fixtures must use the envelope snapshot shape:
  - `schema_version`, `snapshot_at`, `generated_at`, `sports[...]`.
- Contract tests must reject raw/legacy non-envelope payloads.
- Availability semantics are contract-first:
  - missing object => unavailable
  - present object with empty arrays => empty state

## Sheet Parity Coverage (Live Route)

### 1) Player ownership standings
Status: Covered
- Columns rendered: `Position`, `Player`, `Team`, `Matchup`, `Salary`, `Own%`, `Points`, `Value`, `Status`.
- Deterministic position fallback:
  - `position` -> non-empty `roster_positions[]` -> non-empty `positions[]` -> `—`.

### 2) VIP lineup detail block
Status: Covered
- VIP cards render `players_live[]` table when available.
- Missing/empty handling:
  - missing `players_live` => compact slots fallback
  - `players_live: []` => explicit empty-state message

### 3) Ownership summary cards
Status: Covered
- Rendered from `contest.metrics.ownership_summary.per_vip`.
- Join precedence is strict:
  - `vip_entry_key` -> `entry_key` -> no match
- No display-name join fallback.

### 4) Cashing + contest context
Status: Covered
- Distance-to-cash points delta is primary from metrics.
- Rank delta is optional context.
- VIP cashing uses distance-to-cash row when available, payout presence as fallback.

### 5) Non-cashing panel
Status: Covered
- Renders `users_not_cashing`, `avg_pmr_remaining`, and `top_remaining_players`.
- Missing/empty handling:
  - missing `non_cashing` => unavailable
  - missing `top_remaining_players` in present section => unavailable top list
  - empty `top_remaining_players` => explicit empty-state

### 6) Top ownership remaining list
Status: Covered
- Watchlist table remains available and is shown alongside ownership summary cards.

### 7) Train finder
Status: Covered (enhanced)
- Uses exporter-ranked train metrics when present.
- Supports top-N default and full-list toggle.

### 8) Player relevance + value cues
Status: Covered
- Player pool hides rows only when `ownership<=0`, `points<=0`, and `value<=0`.
- Value badges are deterministic and shared across player pool + VIP players_live rows:
  - `>=8` Elite, `>=5` Strong, `>=3` Medium, `<3` Low, non-numeric/blank => `N/A`.

### 9) Team row styling (phase 1)
Status: Covered (phase 1)
- Team accent styling is applied to player-pool rows via local team-token mapping.
- Alias normalization is deterministic for NBA (e.g. `GS -> GSW`).
- Unknown/unmapped teams fall back to neutral style.
- VIP players_live rows intentionally remain neutral in phase 1.

## Remaining Enhancements (Post-Parity)
- Trend overlays and decision cues beyond sheet equivalence.
- History snapshot diff preview (TODO):
  - Show inline per-row delta summary versus previous snapshot.
  - Example summary: `+/- contests`, `state changes`, `VIP cashing delta`.
  - Add optional "View details" expander when changes exist.
  - Expanded view should include per-contest changes:
    - state transitions, added/removed contests, primary contest change,
      selected contest VIP cashing/payout deltas, data quality signals.
  - Acceptance:
    - timeline remains scannable without expansion
    - details are deterministic and based on manifest-ordered adjacent snapshots
    - no raw JSON dumps in UI
