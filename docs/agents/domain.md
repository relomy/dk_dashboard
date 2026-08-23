# Domain Documentation Layout

This repository uses a **single-context** layout (no monorepo / workspace split).

## Structure
- `docs/CONTEXT.md` — the single root context document describing what this
  project is, its core domain concepts, and how the pieces fit together.
- `docs/adr/` — Architecture Decision Records, one file per decision
  (`NNNN-short-title.md`), capturing notable choices and their rationale.

## Guidance
- Keep `docs/CONTEXT.md` as the entry point an agent or new contributor reads
  first. Point to the deeper docs already in `docs/` (schema, API contract,
  operations, user guide) rather than duplicating them.
- Add an ADR when a decision is expensive to reverse or would surprise a
  future reader. Keep ADRs short: context, decision, consequences.
- If the project later grows into multiple independent contexts (e.g. a
  workspace split), switch to a multi-context layout: a root `CONTEXT-MAP.md`
  pointing at per-context `CONTEXT.md` files.

Before exploring a relevant area, read `docs/CONTEXT.md` and the ADRs under
`docs/adr/`. If they do not exist, proceed silently. Use the glossary vocabulary
from `docs/CONTEXT.md` when naming domain concepts, and flag conflicts with
existing ADRs instead of silently overriding them.
