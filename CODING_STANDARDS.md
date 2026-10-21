# Coding standards

Read during review. Each rule is a judgement call; lint, `tsc`, Prettier, the token budget and the contract suite enforce the mechanical ones. A documented rule here overrides the smell baseline.

## Vocabulary and ADRs

- Identifiers and UI text use `GLOSSARY.md` terms. Keep the paired terms apart: **Status** is data freshness, **State** is contest lifecycle; a **VIP** is a person, never a lineup. An _Avoid_ term is a finding.
- A change that contradicts an ADR names it; the author amends the ADR or changes course.

## Data flow and seams

- Snapshots flow one way: `lib/generated` -> `lib/types.ts` -> `interpretSnapshot` -> Live model -> components. `interpretSnapshot` is where producer quirks (string ranks, `pts` aliases) are absorbed.
- Snapshot versions other than v3 display as unsupported (ADR-0002).
- Each unit has one job: `lib/` derives as pure functions, `hooks/` fetch and subscribe, `components/` render. A unit doing two of the three is a missing seam.
- New UI composes `components/ui` primitives and Tailwind tokens (ADR-0003); `App.css` only shrinks.

## Module layout

- An area (`shifts`, `liveModel`) exposes its barrel. Importers outside the area use it; the sibling files behind it are internal. A split keeps the barrel, so importers don't change.
- One component folder per area (`components/live`, `components/shifts`); shared primitives in `components/ui`.
- An "under token budget" PR gets a diff read for what `check:pure-move` can't see: line order, scope changes, `import` changes, a dropped `export`.

## Inject time, storage and IO

- Logic that needs the clock, storage or a fetcher takes it as an option defaulting to the real one (`now`, `storage`, `TimelineSource`), as `createShiftsFeed` and `buildTimeline` do. Tests pass a fake.
- A collaborator with a provider or an option is replaced through it; `vi.mock` is for modules with no such seam (`src/lib/shifts` in the shifts-recording test).
- Fake timers drive polling in hook and route tests.
- Timestamps are UTC ISO strings in `lib/`; local time appears at the display edge.

## Missing, empty and zero

Missing section, empty section and zero are three states with three renderings: a missing object is "unavailable", a present-but-empty one is the empty state (`docs/API_CONTRACT.md`, `CashMeter`). Defaults for absent data keep that difference (`??`, an explicit `undefined` branch).

## Tests

- Tests render the route or call the barrel, and assert exact rendered text or values. `getBy*` already throws, so pair it with `toHaveTextContent` or `toBeInTheDocument`.
- Live behaviour is tested on goldens and prod fixtures (`contract/`, `public/mock/`) as well as hand-built snapshots. A prod fixture is trimmed by dropping array elements; its values stay as produced.
- Test helpers live in a kit file without the `.test` suffix (`shiftsTestKit.ts`).

## Change scope

- Stay inside this repository unless a cross-repository change was requested.
- Make the smallest change that fully solves the request, reaching for existing code before a new abstraction. Unrelated refactors go in their own PR.

Completion criterion: every modified file is necessary for the requested behavior or its verification.
