import type { GameStatus, LiveModel } from './liveModel'
import type { ContestState } from './types'

export interface PlayerDigest {
  key: string
  playerKey: string | null
  name: string
  slot: string
  points: number | null
  gameStatus: GameStatus | null
  locked: boolean
  stats: string | null
}

export interface VipDigest {
  key: string
  rank: number | null
  points: number | null
  distanceToCash: { points: number | null; rank: number | null }
  cashing: boolean
  players: PlayerDigest[]
}

/** One snapshot reduced to what the diff compares; the feed stores it and `diffDigests` compares two of them. */
export interface Digest {
  at: number
  snapshotAt: string
  contestKey: string
  contestState: ContestState
  cashLine: { points: number | null; rank: number | null }
  vips: VipDigest[]
}

function contestKeyOf(model: LiveModel): string {
  return `${model.contest.name}|${model.contest.startTime ?? ''}`
}

/** Reduces a Live model to its digest; `at` is the build clock in epoch milliseconds. */
export function digestOf(model: LiveModel, at: number): Digest {
  return {
    at,
    snapshotAt: model.snapshotAt,
    contestKey: contestKeyOf(model),
    contestState: model.contest.state,
    cashLine: { points: model.cashLine.points, rank: model.cashLine.rank },
    vips: model.vips.map((vip) => ({
      key: vip.key,
      rank: vip.rank,
      points: vip.points,
      distanceToCash: { points: vip.distanceToCash.points, rank: vip.distanceToCash.rank },
      cashing: vip.cashing,
      players: vip.players.map((player) => ({
        key: player.key,
        playerKey: player.playerKey,
        name: player.name,
        slot: player.slot,
        points: player.points,
        gameStatus: player.gameStatus,
        locked: player.locked,
        stats: player.stats,
      })),
    })),
  }
}

/** VIPs by key; a VIP listed twice keeps its first entry. */
export function vipsByKey(vips: VipDigest[]): Map<string, VipDigest> {
  const byKey = new Map<string, VipDigest>()
  for (const vip of vips) if (!byKey.has(vip.key)) byKey.set(vip.key, vip)
  return byKey
}

/**
 * The Seen mark as it applies to the current model: a VIP's own first appearance is that VIP's baseline, so a VIP
 * new to the model joins the Seen mark as it is now (quietly), and a VIP gone from the model drops out of it.
 */
export function reconcileSeen(seen: Digest, current: Digest): Digest {
  const known = vipsByKey(seen.vips)
  return { ...seen, vips: [...vipsByKey(current.vips).values()].map((vip) => known.get(vip.key) ?? vip) }
}
