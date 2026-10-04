# Producer fixture provenance

These files were emitted by the real producer, not hand-written. Refresh them when the feed shape
changes (for example when relomy/dk_results#156 adds metrics).

| Fixture | R2 key (bucket `dk-dashboard-data`) |
| --- | --- |
| `snapshots/live-2026-10-04T18-41-34Z.json` | `snapshots/live-2026-10-04T18-41-34Z.json` |
| `snapshots/live-2026-10-03T20-48-31Z.json` | `snapshots/live-2026-10-03T20-48-31Z.json` |
| `manifest/2026-10-03.json` | `manifest/2026-10-03.json` |

## Refreshing a fixture

```sh
npm run fixture:refresh -- snapshots/live-<timestamp>.json
```

The command reads the key from R2 read-only (`wrangler r2 object get --remote`) with the operator's
Cloudflare login, applies the trimming rules below, and writes `public/mock/<key>`. When the login is
missing it prints the command to run (`npx wrangler login`). It refuses to run in CI. Record the
snapshot key, producer commit, pull date and the row counts it prints in a section below.

## Trimming rules

Snapshots are trimmed only by dropping array elements; no field is renamed, reshaped, reformatted
or added. Kept elements are copied byte for byte, so key order and the producer's JSON formatting
(including floats such as `94.0`) match the original. Only two arrays are trimmed:

- `contests[].standings` keeps the first 25 rows, every tracked VIP's row (`is_vip`, or named by
  `vip_lineups`), every row `ownership_watchlist.entries` references, the last cashing row and the
  first row below it, and then every row tied on rank with a kept row.
- `players` keeps every player a contest references (any `player_key` or `player_name`, including
  VIP lineups and metrics, and every name in a `train_clusters[].lineup_signature`; names match after
  trimming whitespace) plus the 25 most owned.
- Every other array, including `train_clusters`, `vip_lineups` and all metrics, is complete.

## `snapshots/live-2026-10-04T18-41-34Z.json`

NFL mid-slate plus golf, captured for relomy/dk_dashboard#37.

- Producer: `dk_results` production feed `snapshot_feed.py`.
- Producer commit: `527b3d06a75b280154c707cfc730a0c4af170634` (relomy/dk_results#177), the producer's
  `main` at snapshot time. The feed runs on an external scheduler, so the deployed revision is not
  recorded in the snapshot; the snapshot carries #177's locked-slot and `is_partial` fields.
- Pulled read-only from R2 on 2026-10-04 with `npm run fixture:refresh`.
- `nfl`: six VIPs ranked 511–1014 (as strings), all below the 500-row standings cut, so none has a
  standings row; locked slots (`is_locked`, no `player_key`); padded DST names (`"Rams "`, `"Jets "`);
  tied scores inside the cash line (ranks 12, 24, 183, 244 and 400); full metrics including
  `threat.vip_vs_field_leverage` and `threat.top_swing_players`.
- `golf`: two VIPs (ranks 72 and 78) with standings rows; no ownership watchlist.

| Array | Rows |
| --- | --- |
| `sports.golf.contests[0].standings` | 114 → 29 |
| `sports.golf.players` | 124 → 27 |
| `sports.nfl.contests[0].standings` | 500 → 52 |
| `sports.nfl.players` | 629 → 45 |

## `snapshots/live-2026-10-03T20-48-31Z.json` (stale)

Kept until the Live route tests move to the 2026-10-04 fixture. It has zero VIP lineups and almost
no metrics.

- Producer: `dk_results` production feed `snapshot_feed.py` (not `export_fixture.py`).
- Producer commit: `a04055d1ee51562dcee36bf9dfaf0e6d8ff3e88d`.
- Pulled read-only from R2 on 2026-10-03 with `wrangler r2 object get --remote`.
- Sports: `cfb`, `golf`, `mlb`. Contains locked lineup slots (`mlb` train clusters).
- The manifest is unmodified. It also lists `snapshots/live-2026-10-03T18-57-07Z.json`, which is not
  committed.
- Trimmed by hand before the refresh command existed: standings keep the first 25 rows plus every
  watchlist row; players keep every train-signature player plus the 25 most owned.

| Array | cfb | golf | mlb |
| --- | --- | --- | --- |
| `contests[0].standings` | 229 → 35 | 114 → 29 | 151 → 35 |
| `players` | 867 → 34 | 124 → 26 | 359 → 27 |
