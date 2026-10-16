# The prod check runs in GitHub Actions on demand and commits only failing snapshots

## Context

[ADR-0005](0005-dashboard-verifies-itself-against-the-producer-contract.md) rejected scheduled prod
monitoring, and the docs said the prod check "never runs in CI". That tied the check to one laptop with a
`wrangler login`, while the verification checklist asks for its report on every Live view or snapshot-handling
change. Prod snapshots also age out of R2 after 30 days, so the evidence for a quirk is gone unless someone
captures it by hand. PR CI checks the Live view only against the producer's goldens and a few prod fixtures
captured early in October 2026.

## Decision

The prod check runs in a manually dispatched GitHub Actions workflow (`prod-check.yml`) with an R2 access key
that can only read the `dk-dashboard-data` bucket (an R2 token with Object Read only, scoped to that bucket), stored
with the account ID as repository secrets.

- **On demand.** The operator dispatches it from the GitHub app or website; nothing triggers it automatically.
- **Read-only.** CI reads through R2's S3-compatible API (`GET` only, signed by `curl --aws-sigv4`), and the wrangler
  source still runs only `whoami` and `object get`. CI does not use wrangler: a bucket-scoped R2 token is refused
  by the REST endpoint wrangler calls (`403`, code 10000), and the only token it accepts reads every R2 bucket in the account.
- **No check logic in the YAML.** The workflow runs `npm run prod:check`, publishes its report to the job
  summary and exits with its exit code.
- **Commits only what caught something.** A passing run commits nothing. A run that fails the Live contract
  is meant to leave a prod fixture of the failing snapshot (a later change); one that fails only on the
  producer's presence warnings is meant to leave an issue for a producer fix.

We rejected:

- **A required check on every PR.** Its verdict depends on what is live that day, so it would be red or green
  for reasons unrelated to the change.
- **A scheduled capture.** It grows the corpus with fixtures that caught nothing.
- **Committing every captured snapshot.** A snapshot of a producer bug would fail every PR forever.

## Consequences

Prod data enters CI only when it caught something. The check no longer needs an operator's laptop, but it needs
the two repository secrets; a run without them fails naming them. Automatic triggering is deferred until manual
use shows a need. This supersedes the "never in CI" wording for the prod check that ADR-0005 and the verification docs carried;
"never on a schedule" still holds.
