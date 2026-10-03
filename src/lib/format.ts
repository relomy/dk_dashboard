const DASH = '—'

function formatFixed(value: number | null | undefined, digits: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DASH
  }
  return value.toFixed(digits)
}

export function formatPoints(value: number | null | undefined): string {
  return formatFixed(value, 1)
}

export function formatPmr(value: number | null | undefined): string {
  return formatFixed(value, 1)
}
