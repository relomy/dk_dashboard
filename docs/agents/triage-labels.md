# Triage Labels

The issue workflow relies on five canonical roles, each mapped to a GitHub label
on `relomy/dk_dashboard`. These are the default names (role == label name):

| Role             | Label            | Meaning                                             |
| ---------------- | ---------------- | --------------------------------------------------- |
| needs-triage     | `needs-triage`   | New issue, not yet assessed.                         |
| needs-info       | `needs-info`     | Blocked pending more information from the reporter.  |
| ready-for-agent  | `ready-for-agent`| Scoped and ready for an automated agent to pick up.  |
| ready-for-human  | `ready-for-human`| Needs a human decision or hands-on work.             |
| wontfix          | `wontfix`        | Acknowledged but will not be worked on.              |

## Status on the repository
All five labels exist on `relomy/dk_dashboard`.

To add or rename a label later, use the GitHub UI (Issues → Labels) or the
`gh label` command with repo access, then update the table above to match.
