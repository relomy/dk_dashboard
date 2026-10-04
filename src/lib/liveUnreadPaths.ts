import { buildLiveModel } from './liveModel'
import allowlist from './liveUnreadAllowlist.json'
import type { Snapshot } from './types'
import { unreadPaths, type UnreadAllowlist } from './unreadPaths'

/**
 * The snapshot paths the Live view deliberately leaves unread, each with its reason. A change to
 * the list is a reviewed decision: the contract test fails on an unread path it lacks, and on an
 * entry no input leaves unread any more.
 */
export const LIVE_UNREAD_ALLOWLIST: UnreadAllowlist = allowlist

/**
 * The paths a snapshot emits for one sport that building its Live model never reads (#42).
 * "Read" means read by `buildLiveModel` while it runs: the Live view's components and presentation
 * helpers (`haveOrFade` and the like) see only the model, never the snapshot.
 *
 * Only the snapshot's top-level fields and the sport's own feed count; other sports are their own
 * Live views. The sport key is written `*` (`sports.*.players[].salary`), so one path covers every sport.
 */
export function liveUnreadPaths(snapshot: Snapshot, sport: string): string[] {
  const scoped: Snapshot = { ...snapshot, sports: { [sport]: snapshot.sports[sport] } }
  const prefix = `sports.${sport}`
  return unreadPaths(scoped, (feed) => buildLiveModel(feed, sport))
    .map((path) => (path === prefix || path.startsWith(`${prefix}.`) ? `sports.*${path.slice(prefix.length)}` : path))
    .sort()
}
