export type LineupSlot = { label: string; locked: boolean }

const LOCKED_MARKER = 'LOCKED 🔒'

// The only code that knows the producer's pipe-joined lineup_signature format.
// Replace this when the feed emits a structured lineup (relomy/dk_results#155).
export function parseLineupSignature(signature: string | null | undefined): LineupSlot[] {
  if (!signature) {
    return []
  }
  return signature
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) =>
      part === LOCKED_MARKER ? { label: 'Locked 🔒', locked: true } : { label: part, locked: false },
    )
}
