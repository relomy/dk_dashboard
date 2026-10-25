# AGENTS.md

## Project

`dk-dashboard` is a static React dashboard for viewing DraftKings snapshot data from `dk_results`.

- Source: `src/`
- Application tests: `src/test/` and `src/lib/__tests__/`
- Pages Functions typecheck: `npm run check:functions`

## Task routing

- For change boundaries and implementation conventions, read [`CODING_STANDARDS.md`](CODING_STANDARDS.md).
- For local setup, checks, and completion gates, read [`docs/VERIFICATION.md`](docs/VERIFICATION.md).
- For branch/base, pull-request, review, merge, or handoff work, read [`docs/WORKFLOW.md`](docs/WORKFLOW.md); branch and issue-linked PR guidance is in [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).
- For token-budget or file-splitting work, including when a file approaches 5,000 tokens or a size check blocks a commit, read [Token budget](docs/WORKFLOW.md#token-budget).
- For commit messages, read [`docs/COMMITS.md`](docs/COMMITS.md).

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues; use `gh` for issue operations. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
