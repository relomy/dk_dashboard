# Dashboard Feature Parity Gap

Date: 2026-02-21
Scope: Compare current `dk_dashboard` live route with the `dk_results` baseline feature spec and sheet-driven parity expectations.

## Baseline
Source baseline:
- `dk_results/docs/dk-results-feature-spec.md`
- `dk_results/docs/google-sheet-feature-set-and-parity.md`

Primary dashboard scope reviewed:
- `src/routes/Live.tsx`
- `src/lib/types.ts`

## Gap Summary

### 1) Player ownership standings
Status: Partial

Current dashboard:
- Columns: `Player`, `Team`, `Own%`, `Actual`, `Projected`, `Status`.

Missing for parity:
- `Position`, `Matchup`, `Salary`, `Value` columns.
- Team color cell semantics (NBA).
- Heat/gradient conditional formatting semantics.

### 2) VIP lineup detail block
Status: Missing (major)

Current dashboard:
- VIP card shows lineup status, distance/rank delta, and slot->name list.

Missing for parity:
- Per-player VIP row stats:
  - `Own`, `Salary`, `Pts`, `Value`, `RT Proj`, `Time`, `Stats`.
- Table-style VIP lineup block structure used in sheet workflow.

### 3) Ownership summary cards
Status: Partial

Current dashboard:
- Shows watchlist `ownership_remaining_total_pct` and top-N entries.

Missing for parity:
- Explicit split metrics:
  - `Total Ownership`
  - `Ownership in play` (live players only)
- Explicit source/scope labels for those summary cards.

### 4) Cashing + contest context
Status: Mostly covered

Current dashboard:
- Contest identity, cash line points/rank, VIP cashing badge, distance-to-cash.

Minor parity gaps:
- Sheet-style compact presentation of contest/cashing context.

### 5) Non-cashing panel
Status: Missing

Current dashboard:
- No dedicated non-cashing summary block.

Missing for parity:
- `Users not cashing`.
- `Avg PMR remaining`.
- Explicit non-cashing top ownership section.

### 6) Top ownership remaining list
Status: Covered (different presentation)

Current dashboard:
- Top-N ownership watchlist table exists.

Parity notes:
- Mostly labeling/grouping differences vs sheet.

### 7) Train finder
Status: Covered (enhanced)

Current dashboard:
- Ranked clusters, top/all toggle, composition summary, sample entries.

Parity notes:
- Already at or above sheet utility for train view.

## Data Contract Dependencies (for parity completion)
1. VIP per-player details require exporter field set (`vip_lineups[].players_live[]` or equivalent).
2. Ownership summary cards require explicit total/in-play metrics with scope/source.
3. Non-cashing panel requires explicit non-cashing summary metrics.
4. Player table expansion requires stable player fields for position/matchup/salary/value and optional team-color metadata.

## Recommended Execution Order
1. Contract-first additions from `dk_results`:
   - VIP player-level detail
   - ownership summary split
   - non-cashing summary metrics
2. Dashboard rendering tranche:
   - VIP detailed rows
   - ownership summary cards
   - non-cashing panel
   - expanded player table columns
3. Visual parity polish:
   - team color treatments
   - optional conditional formatting themes
4. Post-parity enhancements:
   - trend/time-series indicators
   - action-oriented decision cards

## Acceptance Criteria for “Parity Achieved”
1. Every sheet panel has a dashboard counterpart with equivalent core data.
2. Missing/empty states follow canonical contract rules.
3. Cashing/ownership semantics match documented precedence rules.
4. Live route tests cover both fully-populated and metrics-missing scenarios.
