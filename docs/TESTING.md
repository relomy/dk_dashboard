# Testing and verification

## Setup

- Check for `node_modules` before running project commands. If dependencies are absent, run `npm ci`.
- If npm cannot reach the registry from the sandbox, retry `npm ci` with network access before diagnosing registry or project configuration.
- If `gh auth status` fails in the sandbox, retry with elevated access before concluding the saved GitHub login is invalid or asking the user to log in again.
- Run Wrangler commands with a writable log path, as the package scripts do. If the sandbox blocks Wrangler's auth/config directory, retry with elevated access. Cloudflare operations also require Wrangler authentication or the R2 credentials documented below.

Before claiming completion:

1. For behavior changes, run tests covering the changed behavior with `npm test` or a narrower Vitest command. Documentation-only changes may skip tests.
2. For source changes, run `npm run lint` and `npm run format:check`. `npm run format` applies formatting; it is not the check. For documentation changes, run `npx prettier --check` on the changed Markdown files.
3. Run `npm run build` for application source or build-configuration changes.
4. Run `npm run check:functions` when changing `functions/` or shared worker types.
5. For changes to the Live view (`src/routes/Live.tsx`, `src/lib/live*`) or snapshot handling (`src/lib/types.ts`, the snapshot model and its helpers), run the prod check and include its report in the PR (see below).

Completion criterion: all applicable checks have passed, or each failure and its impact is reported. Report commands, failures, and follow-up risks at handoff as described in [`docs/WORKFLOW.md`](WORKFLOW.md#handoff).

## Prod check

`npm run prod:check -- [<sport>...] [snapshots/live-<timestamp>.json]` runs the Live contract test's invariants (`src/lib/liveInvariants.ts`) and unread-field detector (`src/lib/liveUnreadPaths.ts`, allowlist in `src/lib/liveUnreadAllowlist.json`) against a real prod snapshot. It checks every sport in the snapshot unless you name some, and defaults to the latest snapshot (the one `latest.json` points at); pass a snapshot key to check that snapshot instead.

- Run it for the sports your change touches, or all of them (`nfl` and `golf` are in prod today).
- Paste the compact report (sections available, each VIP's card figures, invariant results, unread paths) into the PR. It never prints the raw snapshot.
- A sport the snapshot lacks, or the Live view can't render, is reported as skipped with a reason and doesn't fail the run; a run with no checked sport passes with a note, unless the snapshot records presence warnings.
- Exit code 0 is a pass; 1 is any failure (an invariant violation, an unallowlisted unread path, a presence warning, or a setup error). Fix the failure, or if it shows a producer bug, say so in the PR.
- Without a Cloudflare login, dispatch the **Prod Check** workflow (Actions tab or the GitHub app) with the `snapshot` and `sports` inputs; the report lands in its job summary. For a PR, also pass its number as `pr`: the run checks that PR's head with the branch's code and posts the compact report as a comment on the PR, so you need not paste it (a `pr` run only comments; it never opens a fixture PR). Link the run in the PR. It reads R2 through its S3-compatible API with the `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `CLOUDFLARE_ACCOUNT_ID` repository secrets (an R2 token with Object Read only, scoped to the `dk-dashboard-data` bucket). A passing run commits nothing; a run that fails the Live contract (outcome `dashboard`) opens a draft PR adding the trimmed snapshot to `contract/prod-fixtures/`, with the report in the body (see `public/mock/PRODUCER_FIXTURE.md`). The report also lists the snapshot's **presence warnings** (each with its path and rule). A run that fails only on those (outcome `producer`) commits nothing: it uploads the trimmed snapshot as a run artifact and opens an issue here with the report and a link to it, for a dk_results fix. This workflow's token can't open issues in dk_results, so move or copy the issue. `dashboard` wins when both kinds fail. Run locally, `npm run prod:check` never opens a PR; it reads R2 the same way when those three variables are set in your shell. See [ADR-0006](adr/0006-prod-check-runs-in-github-actions-on-demand.md).
- The report's first line shows the snapshot's **producer commit**, shortened, or `unknown` for an older snapshot. To confirm the snapshot came from the producer you just deployed, pass the full SHA: `npm run prod:check -- --expect-commit <sha>`, or the workflow's `expect_commit` input. The run stops before checking any sport if the stamp is not that commit or a descendant of it (compared through GitHub's compare API on dk_results); retry once the producer has run. A `null` or missing stamp fails the expectation with its own message.
- Locally it reads R2 read-only with your Cloudflare login (`wrangler r2 object get --remote`). When the login is missing it prints `npx wrangler login`; run that, then rerun the check. Do not paste credentials anywhere.
