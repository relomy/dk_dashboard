import { buildInterpretedLiveModel } from './liveModel'
import { interpretSnapshot, isSupportedSnapshot, snapshotProvenance } from './interpretedSnapshot'
import allowlist from './liveUnreadAllowlist.json'
import { leafPaths, readPaths, type UnreadAllowlist } from './unreadPaths'

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
export function liveUnreadPaths(raw: unknown, sport: string): string[] {
  const snapshot = interpretSnapshot(raw)
  if (!isSupportedSnapshot(snapshot)) return []
  const provenance = snapshotProvenance(snapshot)!
  const original = provenance.raw as typeof snapshot
  const scoped = { ...snapshot, sports: { [sport]: snapshot.sports[sport] } }
  const rawScoped = { ...original, sports: { [sport]: original.sports[sport] } }
  const reads = readPaths(scoped, (feed) => buildInterpretedLiveModel(feed, sport), true)
  const consumed = new Set([...reads].map((path) => provenance.origins.has(path) ? provenance.origins.get(path) : path))
  const collapse = (path: string) => path.replace(/\[\d+\]/g, '[]')
  const collapsedReads = new Set([...consumed].filter((path): path is string => typeof path === 'string').map(collapse))
  // Compatibility sources are judged per row; ordinary fields retain the detector's established
  // per-field semantics (e.g. a cashing fallback or a locked player's name is conditional).
  const unread = new Set([...leafPaths(rawScoped, true)].filter((path) =>
    /\.vip_lineups\[\d+\]\.(points|pts|rank|pmr)$/.test(path)
      ? !consumed.has(path)
      : !collapsedReads.has(collapse(path)),
  ).map(collapse))
  const prefix = `sports.${sport}`
  return [...unread]
    .map((path) => (path === prefix || path.startsWith(`${prefix}.`) ? `sports.*${path.slice(prefix.length)}` : path))
    .sort()
}
