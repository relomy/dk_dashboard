# Issue Tracker

Work items for this repository live in **GitHub Issues** on `relomy/dk_dashboard`.

## Where work lives
- Track all bugs, features, and tasks as GitHub Issues.
- Use pull requests for the change itself; link each PR to its issue.
- The default branch is the base for new work branches.

## Issue lifecycle
Issues move through a small set of triage states, expressed as GitHub labels.
See `docs/agents/triage-labels.md` for the label vocabulary and the roles they play.

Typical flow:
1. A new issue is opened and labeled `needs-triage`.
2. Triage either requests more detail (`needs-info`), routes it to an agent
   (`ready-for-agent`) or a person (`ready-for-human`), or closes it (`wontfix`).
3. When work completes, the issue is closed with an appropriate `state_reason`.

## Conventions
- Prefer searching existing issues before opening a new one to avoid duplicates.
- Keep titles short and imperative; put reproduction/detail in the body.
- Reference issues from commits and PRs (`#123`) so history stays linked.

## CLI operations

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

When a skill says to publish to the issue tracker, create a GitHub issue.
PRs are not a separate triage request surface.
