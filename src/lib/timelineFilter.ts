import type { ShiftItem, ShiftPart, TimelineEntry, TimelineGapEntry, TimelineStep } from './shifts'

/** The five kinds, in the order the filter bar lists them. */
export const ALL_KINDS: readonly ShiftPart[] = [
  'rank-points',
  'player-events',
  'cash-line',
  'crossings',
  'contest-state',
]

export const KIND_LABEL: Record<ShiftPart, string> = {
  'rank-points': 'Rank & points',
  'player-events': 'Player events',
  'cash-line': 'Cash line',
  crossings: 'Crossings',
  'contest-state': 'Contest state',
}

/** The parts that are High priority: a cash crossing and a contest state change. Every other part is Normal. */
const HIGH_PARTS: ReadonlySet<ShiftPart> = new Set(['crossings', 'contest-state'])

export interface TimelineFilters {
  /** The VIPs whose rows show. Contest-level items ignore it. */
  vips: ReadonlySet<string>
  /** The kinds that show; a part of any other kind sits behind "+N hidden". */
  kinds: ReadonlySet<ShiftPart>
  /** Hides the Normal parts of a row, and rows with no High part. */
  highOnly: boolean
}

/** One row of a Step after filtering: the item, the parts it shows and the parts behind "+N hidden". */
export interface FilteredItem {
  item: ShiftItem
  shown: ShiftPart[]
  hidden: ShiftPart[]
}

export interface FilteredStep {
  kind: 'step'
  step: TimelineStep
  items: FilteredItem[]
}

export type FilteredEntry = FilteredStep | TimelineGapEntry

/**
 * Applies the filters to Timeline entries, newest first in and out. A row keeps the parts that pass the kind and
 * High priority filters and lists the rest as hidden; a row with nothing to show, and a Step with no rows, drop out.
 * Gaps always stay. The VIP filter never touches contest-level items.
 */
export function filterTimeline(entries: TimelineEntry[], filters: TimelineFilters): FilteredEntry[] {
  return entries.flatMap((entry): FilteredEntry[] => {
    if (entry.kind === 'gap') return [entry]
    const items = entry.items.flatMap((item): FilteredItem[] => {
      if (item.kind === 'vip' && !filters.vips.has(item.vipKey)) return []
      const { parts } = item
      const passes = (part: ShiftPart) => filters.kinds.has(part) && (!filters.highOnly || HIGH_PARTS.has(part))
      const shown = parts.filter(passes)
      return shown.length > 0 ? [{ item, shown, hidden: parts.filter((part) => !passes(part)) }] : []
    })
    return items.length > 0 ? [{ kind: 'step', step: entry, items }] : []
  })
}
