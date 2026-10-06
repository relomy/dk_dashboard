# The dashboard verifies itself against the producer's published contract

## Context

[ADR-0001](0001-r2-bucket-is-external-producer-contract.md) makes the R2 bucket a published contract
populated by an external producer. The shape of that contract used to be described three times by hand
(the producer's validator, its prose schema document, and the dashboard's TypeScript types), and they
drifted apart. Live view bugs reached prod because nothing in either repository checked the dashboard
against what the producer really emits (relomy/dk_dashboard#37). The producer now owns one machine-readable
contract: pydantic models, an exported JSON Schema, committed golden envelopes and a compatibility gate
([dk_results ADR-0014](https://github.com/relomy/dk_results/blob/main/docs/adr/0014-producer-owned-snapshot-contract.md),
relomy/dk_results#180).

## Decision

The dashboard checks itself against the producer's published contract, at PR time, in its own CI:

- **Generated types.** Snapshot types are generated from the exported schema, pulled at a commit pinned in
  `contract/producer-pin.json` (`npm run contract:sync`). The dashboard changes only when someone takes a new
  producer version.
- **Goldens.** The producer's golden envelopes are synced with the schema and run through the contract suite
  alongside the captured prod fixtures.
- **Captured prod fixtures.** Real snapshots, trimmed by dropping array elements only, cover quirks the
  producer's designed scenarios do not.
- **The contract suite.** Hand-written invariants on what the Live view shows, plus the unread-field
  detector with its reviewed allowlist, run on every input.
- **Bump PRs.** A scheduled workflow compares the pin with the producer's `main` and opens or updates one PR
  that takes the new version. That PR's full CI is the compatibility verdict.

We rejected:

- **Scheduled prod monitoring as the primary defence.** It finds a bug after it has shipped, from a snapshot
  that may not exercise the case. Prod is still read on demand (`npm run prod:check`), never on a schedule.
- **Running dashboard tests in producer CI.** The producer owns the contract; a consumer bug or flaky test
  should never block a producer merge, and it would couple the repositories' release cycles.
- **Hand-maintained types.** That is how the shape drifted in the first place.

## Consequences

A producer change reaches the dashboard as a reviewable bump PR, red when the dashboard no longer fits.
Generated types alone do not catch a value that is present but unusable (a string `rank` still compiles
through the dashboard's lenient value helpers), so the contract suite's invariants on real producer output
remain the guard for that. The pin means the dashboard can lag the producer; the bump PR is how it learns.

Until the hand-written snapshot types re-export the generated ones (relomy/dk_dashboard#46), the generated
module is checked for freshness against the pinned schema but the app does not yet read it, so a schema change
turns a bump PR red through the contract suite, not through the build.
