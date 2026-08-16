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
- `wontfix` already exists (GitHub default label).
- `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` must be
  created before the workflow is usable.

## Creating the labels
This session cannot create repository labels (no label-write tool / no `gh`
access). Run the helper script once with an account that has repo access:

```bash
scripts/setup-triage-labels.sh          # uses gh CLI, targets relomy/dk_dashboard
```

The script is idempotent — re-running it leaves existing labels untouched.
