import {
  DISTANCE_TO_CASH_POINTS_THRESHOLD,
  DISTANCE_TO_CASH_RANK_THRESHOLD,
  VIP_POINTS_THRESHOLD,
  VIP_RANK_THRESHOLD,
} from './shiftsConfig'
import type { Digest, PlayerDigest, VipDigest } from './shiftsDigest'
import { vipsByKey } from './shiftsDigest'
import type { CrossingEntry, LogEntry } from './shiftsLog'
import { contestStateItems, detectCompletion, detectCrossings } from './shiftsLog'
import { cashLineMoved, cashLineMoveOf, itemId, moveOf, movedBy, pointsMoveOf, sameValue } from './shiftsMoves'
import type { CashLineShiftItem, CrossingPath, LineupSlotDiff, ShiftItem, VipShiftItem } from './shiftsTypes'

/** A player is the same across polls by `playerKey`, else by trimmed name; never by slot position. */
function playerIdOf(player: PlayerDigest): string {
  return player.playerKey ? `key:${player.playerKey}` : `name:${player.name.trim()}`
}

/**
 * The lineup diff: one entry per slot of the current lineup. A locked slot now unlocked is a reveal, decided by
 * slot position: no points before, the first points as its move. Every other move is the player's own points,
 * matched by `playerKey`; a player who appears (a late swap) is not compared.
 */
function lineupDiff(before: PlayerDigest[], after: PlayerDigest[]): { slots: LineupSlotDiff[]; changedCount: number } {
  const prior = new Map<string, PlayerDigest>()
  for (const player of before)
    if (!player.locked && !prior.has(playerIdOf(player))) prior.set(playerIdOf(player), player)
  const changed: LineupSlotDiff[] = []
  const unchanged: LineupSlotDiff[] = []
  const hidden: LineupSlotDiff[] = []
  after.forEach((player, index) => {
    const wasLocked = before[index]?.locked ?? false
    const locked = moveOf(wasLocked, player.locked)
    if (player.locked) {
      hidden.push({
        key: player.key,
        slot: player.slot,
        name: player.name,
        playerKey: null,
        points: moveOf(null, null),
        pointsMove: null,
        locked,
        gameStatus: moveOf(null, null),
      })
      return
    }
    const reveal = wasLocked
    const match = reveal ? undefined : prior.get(playerIdOf(player))
    const points = moveOf(match?.points ?? null, player.points)
    const pointsMove = reveal ? player.points : pointsMoveOf(points.from, points.to)
    const gameStatus = moveOf(match?.gameStatus ?? null, player.gameStatus)
    const slot: LineupSlotDiff = {
      key: player.key,
      slot: player.slot,
      name: player.name,
      playerKey: player.playerKey,
      points,
      pointsMove,
      locked,
      gameStatus,
    }
    const stats = moveOf(match?.stats ?? null, player.stats)
    if ((match || reveal) && stats.to !== null && !sameValue(stats)) slot.stats = stats
    const slotChanged =
      (pointsMove ?? 0) !== 0 || reveal || (match !== undefined && !sameValue(gameStatus)) || slot.stats !== undefined
    ;(slotChanged ? changed : unchanged).push(slot)
  })
  changed.sort((a, b) => Math.abs(b.pointsMove ?? 0) - Math.abs(a.pointsMove ?? 0))
  return { slots: [...changed, ...unchanged, ...hidden], changedCount: changed.length }
}

/**
 * Net VIP shifts: one item per VIP present on both sides whose rank, points or distance to cash moved by at least
 * its threshold. A VIP on one side only (added to or removed from the Profile) is quietly ignored: no shift.
 */
export function netVipShifts(seen: Digest, current: Digest, idAnchor: string | number): VipShiftItem[] {
  const final = current.contestState === 'completed'
  const before = vipsByKey(seen.vips)
  const items: VipShiftItem[] = []
  const handledKeys = new Set<string>()
  for (const vip of current.vips) {
    const prior = before.get(vip.key)
    if (!prior || handledKeys.has(vip.key)) continue
    handledKeys.add(vip.key)
    const item = vipItemOf(prior, vip, current, idAnchor, final)
    // Final standings are settled, so any difference in them is worth reporting; live moves must clear a threshold.
    const shifted = final
      ? !sameValue(item.rank) || !sameValue(item.points) || prior.cashing !== vip.cashing
      : item.parts?.includes('rank-points')
    if (shifted) items.push(item)
  }
  return items
}

/** A VIP's item from the Seen mark to now: live moves and lineup, or final standings only once completed. */
function vipItemOf(
  prior: VipDigest,
  vip: VipDigest,
  current: Digest,
  idAnchor: string | number,
  final: boolean,
): VipShiftItem {
  const item: VipShiftItem = {
    kind: 'vip',
    id: itemId('vip', vip.key, idAnchor),
    priority: 'normal',
    detectedAt: current.at,
    snapshotAt: current.snapshotAt,
    parts: [],
    vipKey: vip.key,
    rank: moveOf(prior.rank, vip.rank),
    points: moveOf(prior.points, vip.points),
    distanceToCashPoints: final ? moveOf(null, null) : moveOf(prior.distanceToCash.points, vip.distanceToCash.points),
    distanceToCashRank: final ? moveOf(null, null) : moveOf(prior.distanceToCash.rank, vip.distanceToCash.rank),
  }
  if (final) {
    item.finishedCashing = vip.cashing
    item.parts = ['contest-state']
    return item
  }
  const lineup = lineupDiff(prior.players, vip.players)
  item.lineup = lineup.slots
  const rankAndPoints =
    movedBy(item.rank, VIP_RANK_THRESHOLD) ||
    movedBy(item.points, VIP_POINTS_THRESHOLD) ||
    movedBy(item.distanceToCashPoints, DISTANCE_TO_CASH_POINTS_THRESHOLD) ||
    movedBy(item.distanceToCashRank, DISTANCE_TO_CASH_RANK_THRESHOLD)
  item.parts = [
    ...(rankAndPoints ? ['rank-points' as const] : []),
    ...(lineup.changedCount > 0 ? ['player-events' as const] : []),
  ]
  return item
}

/** The net cash line move since the Seen mark, or none below its threshold. */
export function cashLineShift(seen: Digest, current: Digest, idAnchor: string | number): CashLineShiftItem[] {
  const move = cashLineMoveOf(seen, current)
  if (!cashLineMoved(move)) return []
  return [
    {
      kind: 'cash-line',
      id: itemId('cash-line', idAnchor),
      priority: 'normal',
      detectedAt: current.at,
      snapshotAt: current.snapshotAt,
      parts: ['cash-line'],
      ...move,
    },
  ]
}

/**
 * Folds the log's crossings into the VIP items: a crossing makes the VIP's item High with its path, and creates the
 * item (from the Seen mark's rank and points) when the net moves alone would not have. A VIP missing from the Seen
 * mark or the current model gets none.
 */
export function withCrossings(
  items: VipShiftItem[],
  seen: Digest,
  current: Digest,
  log: LogEntry[],
  idAnchor: string | number,
): VipShiftItem[] {
  const byVip = new Map<string, CrossingEntry[]>()
  for (const entry of log)
    if (entry.kind === 'crossing') byVip.set(entry.vipKey, [...(byVip.get(entry.vipKey) ?? []), entry])
  const result = new Map(items.map((item) => [item.vipKey, item]))
  const priorOf = vipsByKey(seen.vips)
  for (const vip of current.vips) {
    const crossings = byVip.get(vip.key)
    const prior = priorOf.get(vip.key)
    if (!crossings || !prior) continue
    const firstDirection = crossings[0].direction
    const latestCrossing = crossings[crossings.length - 1]
    const path: CrossingPath =
      firstDirection === latestCrossing.direction
        ? firstDirection
        : firstDirection === 'in'
          ? 'in then out'
          : 'out then in'
    const baseItem =
      result.get(vip.key) ?? vipItemOf(prior, vip, current, idAnchor, current.contestState === 'completed')
    result.set(vip.key, {
      ...baseItem,
      priority: 'high',
      parts: [...(baseItem.parts ?? []), 'crossings'],
      surfaced: crossings.every((entry) => entry.surfaced),
      crossing: { path, cause: latestCrossing.cause },
    })
  }
  return [...result.values()]
}

function rankMagnitude(item: ShiftItem): number {
  if (item.kind !== 'vip' || item.rank.from === null || item.rank.to === null) return 0
  return Math.abs(item.rank.to - item.rank.from)
}

/** High priority first, then the largest absolute rank move. */
export function orderFeed(items: ShiftItem[]): ShiftItem[] {
  const weight = (item: ShiftItem) => (item.priority === 'high' ? 1 : 0)
  return [...items].sort((a, b) => weight(b) - weight(a) || rankMagnitude(b) - rankMagnitude(a))
}

/**
 * One step of change: the items for `after` compared with the digest `before` it, not netted against anything
 * earlier, so a crossing in and then out is two items in two steps. Thresholds are the feed's. Items carry the later
 * snapshot's time, ids that depend only on the two digests' snapshots (the same pair always gives the same ids), and
 * no surfaced state. Nothing is reported once `before` is completed.
 */
export function diffDigests(before: Digest, after: Digest): ShiftItem[] {
  if (before.contestState === 'completed') return []
  const anchor = after.snapshotAt
  const log = [...detectCompletion(before, after), ...detectCrossings(before, after)].map((entry): LogEntry => ({
    ...entry,
    seq: 0,
    id: entry.kind === 'crossing' ? itemId('crossing', entry.vipKey, anchor) : itemId('contest-state', anchor),
  }))
  const items = orderFeed([
    ...contestStateItems(log, anchor),
    ...withCrossings(netVipShifts(before, after, anchor), before, after, log, anchor),
    ...cashLineShift(before, after, anchor),
  ])
  return items.map((item) => {
    const copy = { ...item }
    delete copy.surfaced
    return copy
  })
}
