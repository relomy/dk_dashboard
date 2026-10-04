/** Shown in place of a value the snapshot does not provide. */
export const DASH = '—'

function formatFixed(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH
  }
  return value.toFixed(decimals)
}

/** A contest rank: "#12", or a dash when missing. */
export function formatRank(rank: number | null): string {
  return rank === null ? DASH : `#${rank}`
}

/** Fantasy points, to 2 decimals. */
export function formatPoints(value: number | null | undefined): string {
  return formatFixed(value, 2)
}

/** Player minutes remaining (PMR), to 1 decimal. */
export function formatPmr(value: number | null | undefined): string {
  return formatFixed(value, 1)
}

/**
 * A signed distance (to cash): "+50.25", or "−78.5" with a true minus sign. Up to 2 decimals,
 * trailing zeros trimmed; a dash when missing. Zero and values that round to zero read "+0".
 */
export function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH
  }
  const rounded = Math.round(value * 100) / 100
  const text = String(Math.abs(rounded))
  return rounded < 0 ? `−${text}` : `+${text}`
}
