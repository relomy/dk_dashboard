const DASH = '—'

function formatFixed(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return DASH
  }
  return value.toFixed(decimals)
}

export function formatPoints(value: number | null | undefined): string {
  return formatFixed(value, 1)
}

export function formatPmr(value: number | null | undefined): string {
  return formatFixed(value, 1)
}
