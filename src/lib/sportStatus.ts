import type { SportStatus } from './types'

export const statusLabel: Record<SportStatus, string> = {
  ok: 'Fresh',
  stale: 'Stale',
  error: 'Error',
}

/**
 * A data Status's meaning color as Tailwind classes: Fresh = cashing, Stale = cash line,
 * Error = non-cashing. `dot` fills a marker, `badge` tints a pill, `border` outlines a tile
 * and `accentBorder` colors a left border.
 */
export const statusTone: Record<SportStatus, { dot: string; badge: string; border: string; accentBorder: string }> = {
  ok: {
    dot: 'bg-cashing',
    badge: 'bg-cashing-muted text-cashing-foreground',
    border: 'border-cashing/40',
    accentBorder: 'border-l-cashing',
  },
  stale: {
    dot: 'bg-cash-line',
    badge: 'bg-cash-line-muted text-cash-line',
    border: 'border-cash-line/40',
    accentBorder: 'border-l-cash-line',
  },
  error: {
    dot: 'bg-non-cashing',
    badge: 'bg-non-cashing-muted text-non-cashing-foreground',
    border: 'border-non-cashing/40',
    accentBorder: 'border-l-non-cashing',
  },
}
