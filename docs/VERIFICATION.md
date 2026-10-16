# Verification

Before claiming completion:

1. Run tests covering the changed behavior with `npm test` or a narrower Vitest command.
2. Run `npm run lint` for source changes.
3. Run `npm run build` for application source or build-configuration changes.
4. Run `npm run check:functions` when changing `functions/` or shared worker types.
5. For changes to the Live view (`src/routes/Live.tsx`, `src/lib/live*`) or snapshot handling (`src/lib/types.ts`, the snapshot model and its helpers), run the prod check and include its report in the PR (see below).
6. Report changed files and behavior, every command run, every failure with its command and a concise summary, and any follow-up risk or next step.

Completion criterion: all applicable checks have passed, or each failure and its impact is reported.

## Prod check

`npm run prod:check -- [<sport>...] [snapshots/live-<timestamp>.json]` runs the Live contract test's invariants (`src/lib/liveInvariants.ts`) and unread-field detector (`src/lib/liveUnreadPaths.ts`, allowlist in `src/lib/liveUnreadAllowlist.json`) against a real prod snapshot. It checks every sport in the snapshot unless you name some, and defaults to the latest snapshot (the one `latest.json` points at); pass a snapshot key to check that snapshot instead.

- Run it for the sports your change touches, or all of them (`nfl` and `golf` are in prod today).
- Paste the compact report (sections available, each VIP's card figures, invariant results, unread paths) into the PR. It never prints the raw snapshot.
- A sport the snapshot lacks, or the Live view can't render, is reported as skipped with a reason and doesn't fail the run; a run with no checked sport passes with a note.
- Exit code 0 is a pass; 1 is any failure (an invariant violation, an unallowlisted unread path, or a setup error). Fix the failure, or if it shows a producer bug, say so in the PR.
- Without a Cloudflare login, dispatch the **Prod Check** workflow (Actions tab or the GitHub app) with the `snapshot` and `sports` inputs; the report lands in its job summary. For a PR, also pass its number as `pr`: the run checks that PR's head with the branch's code and posts the compact report as a comment on the PR, so you need not paste it (a `pr` run only comments; it never opens a fixture PR). Link the run in the PR. It reads R2 through its S3-compatible API with the `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `CLOUDFLARE_ACCOUNT_ID` repository secrets (an R2 token with Object Read only, scoped to the `dk-dashboard-data` bucket). A passing run commits nothing; a run that fails the Live contract (outcome `dashboard`) opens a draft PR adding the trimmed snapshot to `contract/prod-fixtures/`, with the report in the body (see `public/mock/PRODUCER_FIXTURE.md`). Run locally, `npm run prod:check` never opens a PR; it reads R2 the same way when those three variables are set in your shell. See [ADR-0006](adr/0006-prod-check-runs-in-github-actions-on-demand.md).
- Locally it reads R2 read-only with your Cloudflare login (`wrangler r2 object get --remote`). When the login is missing it prints `npx wrangler login`; run that, then rerun the check. Do not paste credentials anywhere.
