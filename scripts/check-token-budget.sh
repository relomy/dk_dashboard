#!/bin/sh
# Token budget check: no committed file may exceed 5,000 tokens.
#
# Usage: check-token-budget.sh            check the staged files (pre-commit)
#        check-token-budget.sh PATH...    check these repo-root-relative paths (CI)
#
# Tokens = bytes / 4 of the staged blob. There are no per-file exemptions.
# Skipped: deleted files, `linguist-generated` files and binaries.
# Needs only POSIX sh and git.
set -u

LIMIT=5000

# Value of git attribute $1 for path $2, read from the index.
attr() {
  git check-attr --cached "$1" -- "$2" | sed "s/^.*: $1: //"
}

recipe() {
  case $1 in
    *.test.ts | *.test.tsx | *.spec.ts | *.spec.tsx)
      echo "  TS test: split by top-level describe into several *.test.ts(x) files."
      echo "  Move shared fixtures into a test kit module without a .test suffix."
      ;;
    *.ts | *.tsx)
      echo "  TS module: keep this file as a barrel that re-exports the public API"
      echo "  (export type for types) and move cohesive parts into sibling modules."
      ;;
    *.md)
      echo "  Markdown: split by H2 into linked pages, or move content that is not"
      echo "  this doc's job to the doc that owns it. Keep sections that tools read."
      ;;
    *)
      echo "  Split it into smaller files along its natural sections."
      ;;
  esac
}

script=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
cd "$(git rev-parse --show-toplevel)" || exit 2

if [ "$#" -eq 0 ]; then
  # Re-run on the NUL-delimited staged set; the --paths marker stops recursion
  # when xargs runs us with no paths.
  git diff --cached --name-only -z --diff-filter=ACMR |
    xargs -0 sh "$script" --paths || exit 1
  exit 0
fi
[ "$1" = "--paths" ] && shift

empty_tree=$(git hash-object -t tree /dev/null)
failed=0
for path in "$@"; do
  case $(attr linguist-generated "$path") in set | true) continue ;; esac
  bytes=$(git cat-file -s ":$path" 2>/dev/null) || continue
  [ "$bytes" -gt $((LIMIT * 4)) ] || continue
  # git's binary detection on the staged blob: numstat prints "-" for binaries.
  case $(git diff --cached --numstat "$empty_tree" -- "$path") in -*) continue ;; esac
  tokens=$(((bytes + 3) / 4))
  echo "$path: $tokens tokens, budget $LIMIT, over by $((tokens - LIMIT))" >&2
  recipe "$path" >&2
  failed=1
done
if [ "$failed" -ne 0 ]; then
  echo "Token budget exceeded (tokens = bytes / 4)." >&2
  echo "See docs/WORKFLOW.md#token-budget" >&2
fi
exit "$failed"
