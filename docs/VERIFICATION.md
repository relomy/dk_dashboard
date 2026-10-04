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

`npm run prod:check -- <sport> [snapshots/live-<timestamp>.json]` runs the Live contract test's invariants (`src/lib/liveInvariants.ts`) and unread-field detector (`src/lib/liveUnreadPaths.ts`, allowlist in `src/lib/liveUnreadAllowlist.json`) against a real prod snapshot. It defaults to the latest snapshot (the one `latest.json` points at); pass a snapshot key to check that snapshot instead.

- Run it for `nfl`, and for any other sport your change touches (`golf` is the other sport in prod today).
- Paste the compact report (sections available, each VIP's card figures, invariant results, unread paths) into the PR. It never prints the raw snapshot.
- Exit code 0 is a pass; 1 is any failure (an invariant violation, an unallowlisted unread path, a sport the snapshot lacks, or a setup error). Fix the failure, or if it shows a producer bug, say so in the PR.
- It reads R2 read-only with your Cloudflare login (`wrangler r2 object get --remote`) and never runs in CI. When the login is missing it prints `npx wrangler login`; run that, then rerun the check. Do not paste credentials anywhere.
