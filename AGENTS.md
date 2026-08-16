# AGENTS.md

## Scope
These instructions are self-contained for this repository.
Apply them for all work under `dk_dashboard/`.

## Repository Context
- Stack: TypeScript + React + Vite
- Runtime: Node.js
- Package manager / runner: `npm`
- Source code: `src/`
- Tests: Vitest (`npm test`)

## Working Style
- Make the smallest safe change that solves the request.
- Prefer editing existing code over adding new abstractions.
- Avoid unrelated refactors.
- Ask before changing behavior that affects user-facing flows.

## Preferred Commands (Enforced-Lite)
Use these defaults unless blocked by an environment issue:
1. `npm install`
2. `npm test`
3. `npm run lint`
4. `npm run build`

## Change Boundaries
- Keep edits in this repository unless the user explicitly asks for cross-repo changes.
- If another repo needs coordinated updates, stop and ask first.

## Verification Before Completion
Before claiming completion:
1. Run relevant tests for touched functionality.
2. Run lint checks relevant to touched files.
3. Run a build check for `src/` changes.
4. Report any failing checks with exact commands and failure summaries.

## Commit Message Style
- Required format: `type(scope): short summary`
- Use lowercase `type` (`feat`, `fix`, `test`, `docs`, `chore`, etc.)
- Keep summary imperative and concise.
- Non-conforming commit messages are not allowed.

## Output Expectations
In the final response, include:
1. What changed (files and behavior).
2. What commands were run.
3. What passed or failed.
4. Any follow-up risk or next step, if applicable.

## Agent skills
Configuration for engineering-workflow skills lives under `docs/agents/`:
- `docs/agents/issue-tracker.md` — work items live in GitHub Issues (`relomy/dk_dashboard`).
- `docs/agents/triage-labels.md` — the five canonical triage labels and how to create them.
- `docs/agents/domain.md` — single-context domain-docs layout (`docs/CONTEXT.md` + `docs/adr/`).

Edit those files directly to adjust tracker, labels, or docs layout.
