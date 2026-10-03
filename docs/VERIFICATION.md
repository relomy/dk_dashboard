# Verification

Before claiming completion:

1. Run tests covering the changed behavior with `npm test` or a narrower Vitest command.
2. Run `npm run lint` for source changes.
3. Run `npm run build` for application source or build-configuration changes.
4. Run `npm run check:functions` when changing `functions/` or shared worker types.
5. Report changed files and behavior, every command run, every failure with its command and a concise summary, and any follow-up risk or next step.

Completion criterion: all applicable checks have passed, or each failure and its impact is reported.
