# The R2 bucket is a published contract populated by an external producer

## Context

The dashboard's Pages Functions read snapshots, the day manifest, and
`latest.json` out of the R2 bucket `dk-dashboard-data` (`/api/latest`,
`/api/snapshot?path=…`). A reader might reasonably wonder what writes them.

## Decision

The dashboard is a **pure reader** of the bucket. All objects are written by an
external producer, `dk_results`, which runs the snapshot ETL and uploads
`snapshots/<ts>.json`, `manifest/<utc-date>.json`, and `latest.json` via the
R2 S3-compatible API (see `dk_results` ADR-0007). This repo owns the bucket
definition (`wrangler.toml`) and the serving Functions, but never populates it.

## Consequences

The bucket name and key layout are an API, not an internal detail. Renaming the
bucket or changing the `snapshots/*` / `manifest/*` / `latest.json` key shape
breaks the producer silently — coordinate any such change with `dk_results`.
Snapshot keys are immutable and published in dependency order (snapshot before
the `latest.json` that points at it), which is what makes the `public,
max-age=60` cache on `snapshots/*` safe.
