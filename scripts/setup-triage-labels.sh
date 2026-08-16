#!/usr/bin/env bash
# Create the canonical triage labels on the GitHub repository.
# Idempotent: existing labels are updated in place, missing ones are created.
# Requires the `gh` CLI authenticated with repo access.
set -euo pipefail

REPO="${REPO:-relomy/dk_dashboard}"

# role|color|description
labels=(
  "needs-triage|d876e3|New issue, not yet assessed"
  "needs-info|fbca04|Blocked pending more information from the reporter"
  "ready-for-agent|0e8a16|Scoped and ready for an automated agent to pick up"
  "ready-for-human|1d76db|Needs a human decision or hands-on work"
  "wontfix|ffffff|Acknowledged but will not be worked on"
)

for entry in "${labels[@]}"; do
  IFS='|' read -r name color desc <<<"$entry"
  echo "Ensuring label: $name"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null \
    || gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc"
done

echo "Done. Triage labels are in place on $REPO."
