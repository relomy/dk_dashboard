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
the `latest.json` that points at it), which is what makes the long-lived cache on
`snapshots/*` safe. Successful (200) `/api/snapshot` responses for `snapshots/*`
send `Cache-Control: private, max-age=31536000, immutable`; `private` keeps
shared caches from storing an authenticated response. Error responses (401, 400,
404, 500) and `manifest/*` and `latest.json` responses stay `no-store`, because
those keys or statuses can change or appear later.

The browser header stays `private`, but after the session check passes the
endpoint also keeps a **public** copy of each `snapshots/*` response in
Cloudflare's per-data-center edge cache (`public, max-age=86400`; the cache API
refuses to store `private` responses), so R2 is read about once per data center
instead of once per friend. That is safe because the cache lookup happens only
after authentication: no request without a valid session reaches it, and the
cache key is the request URL with no cookies. The stored lifetime is 24 hours so
a copy never outlives the 30-day R2 lifecycle rule that deletes old snapshots.
`manifest/*`, `latest.json` and every error response are never read from or
written to the cache. Responses for `snapshots/*` carry `x-snapshot-cache: hit`
or `miss` so the behavior can be checked in DevTools.
