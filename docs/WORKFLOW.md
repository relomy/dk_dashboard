# Development workflow

Scope and implementation rules live in [`CODING_STANDARDS.md`](../CODING_STANDARDS.md).

- Ask before changing behavior in user-facing flows.

## Branches and pull requests

Use the default branch as the base for new work branches. Use pull requests for changes and link each PR to its issue. See [`docs/agents/issue-tracker.md`](agents/issue-tracker.md) for the repository's branch and issue-linked PR guidance. The repository has no general branch naming, review, or merge procedure beyond applicable task instructions.

Commit message format lives only in [`docs/COMMITS.md`](COMMITS.md).

For a pure-move split, the reviewer still reads the diff for the limits of the automated check described below; see [`CODING_STANDARDS.md`](../CODING_STANDARDS.md#module-layout). Follow task instructions for any additional review or merge requirements.

## Handoff

Before reporting work complete, state the changed files and behavior, every command run, every failure with its exact command and a concise summary, and any follow-up risk or next step. Completion checks and their pass criteria live in [`docs/VERIFICATION.md`](VERIFICATION.md).

## Token budget

No committed file may exceed **5,000 tokens**, where tokens = bytes / 4 (20,000 bytes). A file of exactly 5,000 tokens passes. Agents read files whole; the budget keeps every file small enough to read comfortably.

`scripts/check-token-budget.sh` enforces it. The husky `pre-commit` hook runs lint-staged and then the script, so it measures the staged content as it will be committed. `npm install` (or `npm ci`) activates the hook through the `prepare` script. CI runs the same script on every tracked file, so `--no-verify` doesn't get a file past it. There are no exemptions: when a file is over budget, the only fix is to split it.

The check skips deleted files, binary files and generated files. Generated files are declared once in `.gitattributes` as `linguist-generated` (`package-lock.json`, `contract/`, `src/lib/generated/`, the producer-emitted mocks under `public/mock/`); add a new generated path there, never an exemption in the script.

### Splitting a file

When the hook blocks a commit, it names each file, its tokens, the budget and the overage. Split along a seam; don't trim whitespace or comments to squeeze under.

- **TS/TSX module.** Keep the existing file as the public surface (barrel): move cohesive pieces into sibling files and re-export them, so importers don't change. `verbatimModuleSyntax` requires `export type { ... }` for re-exported types. A module mocked by path in a test (such as `src/lib/shifts.ts`) keeps the functions the mock wraps in the barrel.
- **Test file.** Split per top-level `describe` into sibling `*.test.ts(x)` files. Move shared fixtures and helpers into a kit file without the `.test` suffix (for example `shiftsTestKit.ts`), so the Vitest `include` pattern doesn't pick it up as a test.
- **Markdown doc.** Split by H2 into linked pages, or move content that isn't the doc's job to the doc that owns it.
- **Anything else.** Split by responsibility into smaller files near the original.

### Checking a split

A split must be a pure move, and must pass `npm run check:pure-move`; paste the before/after table it prints into the PR body. It compares HEAD with its merge base with `origin/main`; pass other refs as `npm run check:pure-move -- <base> [<head>]`:

- **Tests:** `vitest list` on the touched test files on both sides must give the same test names (`project|describe > it`), so a lost, renamed, duplicated or no-longer-collected test fails.
- **Code:** every line of a touched `.ts`/`.tsx` file must reappear on the other side, after Prettier collapses reflows. Glue doesn't count: imports, re-exports, `export` on a moved declaration, `eslint-disable` headers, closing brackets and `describe(` wrappers. Any other unmatched line fails, such as an edited assertion or a helper copied instead of moved to a kit. An unmatched comment is listed but doesn't fail.

The check is a guard, not a proof: it compares test names and line multisets, so it can't see line order, scope changes, a line moved between tests, `import` changes or a dropped `export`. The reviewer still reads the diff for those ([`CODING_STANDARDS.md`](../CODING_STANDARDS.md#module-layout)).

CI runs it on every PR whose title contains `under token budget`.

Never run `vitest list --json <path>`: Vitest takes `<path>` as the output file and overwrites it. Write `--json=<file>`.
