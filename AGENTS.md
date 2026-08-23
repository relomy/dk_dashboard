# AGENTS.md

## Project

`dk-dashboard` is a static React dashboard for viewing DraftKings snapshot data from `dk_results`.

- Source: `src/`
- Application tests: `src/test/` and `src/lib/__tests__/`
- Pages Functions typecheck: `npm run check:functions`

## Task routing

- For change boundaries and implementation conventions, read [`docs/WORKFLOW.md`](docs/WORKFLOW.md).
- For completion checks and reporting, read [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
- For commit messages, read [`docs/COMMITS.md`](docs/COMMITS.md).

## Agent skills

### Issue tracker
Issues and specs live in GitHub Issues; use `gh` for issue operations. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
