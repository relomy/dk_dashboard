#!/bin/sh
# Token budget ratchet: the recorded budgets in .gitattributes only ever go down.
# Run in CI next to scripts/check-token-budget.sh, which checks file sizes.
#
# Usage: check-budget-ratchet.sh [BASE]
#
# Fails (exit 1) when
#   - BASE is given and, comparing the `token-budget=` lines of .gitattributes at
#     the merge base with BASE...HEAD by path, a path is new (a renamed
#     grandfathered file counts) or its budget went up. Lowered, removed and
#     reordered lines are fine; or
#   - a tracked file with a `token-budget=` attribute is at or under the
#     5,000-token limit (tokens = bytes / 4), so its stale line would let it
#     regrow. Delete the line in the commit that brings the file under.
#
# Exits 2 when BASE is not a revision. Without BASE only the second check runs.
# Needs only POSIX sh, awk and git.
set -u

LIMIT=5000
base=${1-}
cd "$(git rev-parse --show-toplevel)" || exit 2
failed=0

# Prints "<budget> <path>" for each `token-budget=<N>` line of a .gitattributes on stdin.
budgets() {
  sed -n \
    -e 's/^"\([^"]*\)"\([[:space:]].*\)\{0,1\}[[:space:]]token-budget=\([0-9][0-9]*\).*$/\3 \1/p' \
    -e 's/^\([^#"[:space:]][^[:space:]]*\)\([[:space:]].*\)\{0,1\}[[:space:]]token-budget=\([0-9][0-9]*\).*$/\3 \1/p'
}

if [ -n "$base" ]; then
  merge_base=$(git merge-base "$base" HEAD) || {
    echo "check-budget-ratchet: cannot compare against base '$base'" >&2
    exit 2
  }
  old_attributes=$(git show "$merge_base:.gitattributes") || {
    echo "check-budget-ratchet: cannot read .gitattributes at base '$base'" >&2
    exit 2
  }
  new_attributes=$(git show "HEAD:.gitattributes") || exit 2
  raised=$(
    {
      printf '%s\n' "$old_attributes" | budgets | sed 's/^/old /'
      printf '%s\n' "$new_attributes" | budgets | sed 's/^/new /'
    } | awk '
      { kind = $1; n = $2; path = substr($0, length($1) + length($2) + 3) }
      kind == "old" { old[path] = n }
      kind == "new" { now[path] = n; order[++count] = path }
      END {
        for (i = 1; i <= count; i++) {
          path = order[i]
          if (!(path in old)) print path " token-budget=" now[path] " (new)"
          else if (now[path] + 0 > old[path] + 0) print path " token-budget=" now[path] " (raised from " old[path] ")"
        }
      }'
  )
  if [ -n "$raised" ]; then
    echo "$raised" | sed 's/^/  /' >&2
    echo ".gitattributes adds or raises a token-budget= line. Never add or raise a recorded budget; split the file instead." >&2
    failed=1
  fi
fi

stale=$(
  git ls-files -z |
    xargs -0 -r git -c core.quotePath=false check-attr --cached token-budget -- |
    sed -n 's/: token-budget: \([0-9][0-9]*\)$/ \1/p' |
    while read -r path_and_budget; do
      budget=${path_and_budget##* }
      path=${path_and_budget% *}
      bytes=$(git cat-file -s ":$path" 2>/dev/null) || continue
      [ "$bytes" -gt $((LIMIT * 4)) ] && continue
      echo "$path: $(((bytes + 3) / 4)) tokens, but .gitattributes still records token-budget=$budget"
    done
)
if [ -n "$stale" ]; then
  echo "$stale" | sed 's/^/  /' >&2
  echo "These files are within $LIMIT tokens: delete their token-budget= lines from .gitattributes." >&2
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "See docs/WORKFLOW.md#grandfathered-files" >&2
fi
exit "$failed"
