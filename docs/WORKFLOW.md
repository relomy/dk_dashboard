# Development workflow

Apply these rules to implementation work in this repository:

- Keep changes scoped to this repository unless the user explicitly requests a cross-repository change.
- Ask before changing behavior in user-facing flows.
- Prefer the smallest change that fully solves the request.
- Extend existing code before introducing a new abstraction.
- Keep unrelated refactors out of the change.

Completion criterion: every modified file is necessary for the requested behavior or its verification.

## Token budget

No committed file may exceed **5,000 tokens**, where tokens = bytes / 4 (20,000 bytes). A file of exactly 5,000 tokens passes. Agents read files whole; the budget keeps every file small enough to read comfortably.

`scripts/check-token-budget.sh` enforces it. The husky `pre-commit` hook runs lint-staged and then the script, so it measures the staged content as it will be committed. `npm install` (or `npm ci`) activates the hook through the `prepare` script. CI runs the same script on a PR's changed files, so `--no-verify` doesn't get a file past it. The script is a port of relomy/dk_results' `scripts/check-token-budget.sh`, the source of truth: change behaviour there first, then port it here, keeping only this repo's split recipes and doc pointer different.

The check skips deleted files, binary files and generated files. Generated files are declared once in `.gitattributes` as `linguist-generated` (`package-lock.json`, `contract/`, `src/lib/generated/`, the producer-emitted mocks under `public/mock/`); add a new generated path there, never an exemption in the script.

### Splitting a file

When the hook blocks a commit, it names each file, its tokens, the budget and the overage. Split along a seam; don't trim whitespace or comments to squeeze under.

- **TS/TSX module.** Keep the existing file as the public surface (barrel): move cohesive pieces into sibling files and re-export them, so importers don't change. `verbatimModuleSyntax` requires `export type { ... }` for re-exported types. A module mocked by path in a test (such as `src/lib/shifts.ts`) keeps the functions the mock wraps in the barrel.
- **Test file.** Split per top-level `describe` into sibling `*.test.ts(x)` files. Move shared fixtures and helpers into a kit file without the `.test` suffix (for example `shiftsTestKit.ts`), so the Vitest `include` pattern doesn't pick it up as a test.
- **Markdown doc.** Split by H2 into linked pages, or move content that isn't the doc's job to the doc that owns it.
- **Anything else.** Split by responsibility into smaller files near the original.

### Grandfathered files

Files already over budget when the check landed carry a `token-budget=<tokens>` line in `.gitattributes`: their size then, rounded up. They may shrink but never grow past it. Once a split brings a file under 5,000 tokens, delete its line in the same commit. Never raise a recorded budget to get a commit through.
