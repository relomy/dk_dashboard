# Snapshot Schema

The snapshot feed is `schema_version: 3`. The producer, relomy/dk_results, owns its shape; this
repository keeps no copy of it in prose.

- **Meaning, units and omission rules:** the producer's
  [`docs/SNAPSHOT_SCHEMA.md`](https://github.com/relomy/dk_results/blob/main/docs/SNAPSHOT_SCHEMA.md).
  It also logs breaking changes with their migration notes.
- **Exact shape:** the exported JSON Schema, pinned at [`contract/snapshot.schema.json`](../contract/snapshot.schema.json).
  Snapshot types are generated from it into `src/lib/generated/snapshot.ts`. Which producer commit is
  pinned is recorded in [`contract/producer-pin.json`](../contract/producer-pin.json).
- **Worked examples:** the producer's golden envelopes in [`contract/goldens/`](../contract/goldens), and
  real captured prod snapshots under `public/mock/snapshots/` (provenance in `public/mock/PRODUCER_FIXTURE.md`).
- **What the Live view deliberately ignores:** [`src/lib/liveUnreadAllowlist.json`](../src/lib/liveUnreadAllowlist.json),
  each entry with its reason.

Take a new producer version with `npm run contract:sync -- <dk_results commit sha>`, which fetches the
schema and goldens at that commit, regenerates the types and moves the pin. Then run `npm test` and
`npm run build`. See [ADR-0005](adr/0005-dashboard-verifies-itself-against-the-producer-contract.md)
for why the dashboard is checked this way.

The HTTP API the dashboard's Functions serve is described in [`API_CONTRACT.md`](API_CONTRACT.md).
