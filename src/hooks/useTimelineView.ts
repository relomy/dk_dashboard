import { useCallback, useMemo, useState } from 'react'
import { followedVipKeys } from '../lib/followedVips'
import type { LiveModel } from '../lib/liveModel'
import type { ProfileMatchRules } from '../lib/profiles'
import type { ShiftPart } from '../lib/shifts'
import { ALL_KINDS, type TimelineFilters } from '../lib/timelineFilter'

/** The Timeline's in-memory view state: the filters and Compact. Never stored, so a reload starts from the defaults. */
export interface TimelineView {
  filters: TimelineFilters
  compact: boolean
  /** The VIPs the active Profile follows: the VIP filter's default. */
  followed: ReadonlySet<string>
  /** Whether the filters are at their defaults (Compact is not a filter). */
  isDefault: boolean
  toggleVip: (vipKey: string) => void
  toggleKind: (kind: ShiftPart) => void
  setHighOnly: (on: boolean) => void
  setCompact: (on: boolean) => void
  /** VIPs back to the active Profile, all kinds on, High priority only off. Compact stays as it is. */
  reset: () => void
}

/**
 * Holds the filters and Compact above the Summary and Timeline tabs, so they survive switching between them. The VIP
 * selection stays unset until the user picks, so the default follows the active Profile.
 */
export function useTimelineView(model: LiveModel, rules: ProfileMatchRules): TimelineView {
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const [kinds, setKinds] = useState<ReadonlySet<ShiftPart>>(() => new Set(ALL_KINDS))
  const [highOnly, setHighOnly] = useState(false)
  const [compact, setCompact] = useState(false)
  const followed = useMemo(() => followedVipKeys(model, rules), [model, rules])
  const vips = picked ?? followed

  const toggleVip = useCallback(
    (vipKey: string) => {
      const next = new Set(vips)
      if (!next.delete(vipKey)) next.add(vipKey)
      setPicked(next)
    },
    [vips],
  )
  const toggleKind = useCallback((kind: ShiftPart) => {
    setKinds((current) => {
      const next = new Set(current)
      if (!next.delete(kind)) next.add(kind)
      return next
    })
  }, [])
  const reset = useCallback(() => {
    setPicked(null)
    setKinds(new Set(ALL_KINDS))
    setHighOnly(false)
  }, [])

  return {
    filters: { vips, kinds, highOnly },
    compact,
    followed,
    isDefault: picked === null && kinds.size === ALL_KINDS.length && !highOnly,
    toggleVip,
    toggleKind,
    setHighOnly,
    setCompact,
    reset,
  }
}
