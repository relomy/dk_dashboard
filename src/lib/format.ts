/** Shown in place of a value the snapshot does not provide. */
export const DASH = '—'

function formatFixed(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH
  }
  return value.toFixed(decimals)
}

/** Fantasy points, to 2 decimals. */
export function formatPoints(value: number | null | undefined): string {
  return formatFixed(value, 2)
}

/** Player minutes remaining (PMR), to 1 decimal. */
export function formatPmr(value: number | null | undefined): string {
  return formatFixed(value, 1)
}
