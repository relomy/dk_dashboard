# Producer fixture provenance

These files were emitted by the real producer, not hand-written. Refresh them when the feed shape
changes (for example when relomy/dk_results#156 adds metrics).

| Fixture | R2 key (bucket `dk-dashboard-data`) |
| --- | --- |
| `snapshots/live-2026-10-03T20-48-31Z.json` | `snapshots/live-2026-10-03T20-48-31Z.json` |
| `manifest/2026-10-03.json` | `manifest/2026-10-03.json` |

- Producer: `dk_results` production feed `snapshot_feed.py` (not `export_fixture.py`).
- Producer commit: `a04055d1ee51562dcee36bf9dfaf0e6d8ff3e88d`.
- Pulled read-only from R2 on 2026-10-03 with `wrangler r2 object get --remote`.
- Sports: `cfb`, `golf`, `mlb`. Contains locked lineup slots (`mlb` train clusters).

## Trimming

The manifest is unmodified. The snapshot was trimmed only by dropping array elements; no field was
renamed, reshaped or added, and key order and JSON formatting match the original. Dropped elements:

| Array | cfb | golf | mlb |
| --- | --- | --- | --- |
| `contests[0].standings` | 229 → 35 | 114 → 29 | 151 → 35 |
| `players` | 867 → 34 | 124 → 26 | 359 → 27 |

- Standings keep the first 25 rows plus every row referenced by `ownership_watchlist.entries`.
- Players keep every player named in a `train_clusters[].lineup_signature` plus the 25 most owned.
- `train_clusters` and every other array are complete.
- The manifest also lists `snapshots/live-2026-10-03T18-57-07Z.json`, which is not committed.
