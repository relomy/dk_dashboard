import type { LiveModel } from './liveModel'
import type { ProfileMatchRules } from './profiles'
import { lineupMatchesProfile } from './vipMatcher'

/**
 * The VIPs a Profile follows, matched on the Live model's VIPs. A Profile with no rules follows everyone rather
 * than no one, so an unconfigured Profile still sees a Timeline.
 */
export function followedVipKeys(model: LiveModel, rules: ProfileMatchRules): Set<string> {
  const hasRules = Boolean(rules.contains?.trim() || rules.exact?.trim() || rules.username?.trim())
  const followed = model.vips.filter(
    (vip) => !hasRules || lineupMatchesProfile({ display_name: vip.name, entry_key: vip.key }, rules),
  )
  return new Set(followed.map((vip) => vip.key))
}
