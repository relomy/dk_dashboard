import { expect } from 'vitest'
// Exported by the dk_results producer: cfb and mlb contests (provenance in public/mock/PRODUCER_FIXTURE.md).
import producerSnapshot from '../../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { buildLiveModel, type LiveModel } from '../liveModel'
import { createShiftsFeed, type ShiftsStorage, type VipShiftItem } from '../shifts'
// Exported by the dk_results producer: an NFL mid-slate contest with six VIPs.
import nflSnapshot from '../../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function modelOf(sport: string, mutate: (snapshot: any) => void = () => {}): LiveModel {
  const snapshot: any = structuredClone(producerSnapshot)
  mutate(snapshot)
  const result = buildLiveModel(snapshot, sport)
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function memoryStorage(initial: Record<string, string> = {}): ShiftsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

export const T0 = Date.parse('2026-10-03T21:00:00Z')

export function feedOver(storage: ShiftsStorage | null) {
  return createShiftsFeed({ storage, now: () => T0 })
}

export function expectQuiet(feed: ReturnType<typeof feedOver>) {
  expect(feed.feed()).toEqual([])
  expect(feed.unseenCount()).toBe(0)
  expect(feed.unsurfaced()).toEqual([])
  expect(feed.awaySummary()).toBeNull()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Standing {
  rank?: number
  pts?: number
  distancePoints?: number
  distanceRank?: number
}

export function nflModel(changes: Record<string, Standing> = {}, edit: (snapshot: any) => void = () => {}): LiveModel {
  const snapshot: any = structuredClone(nflSnapshot)
  const contest = snapshot.sports.nfl.contests[0]
  for (const [name, change] of Object.entries(changes)) {
    const lineup = contest.vip_lineups.find((vip: any) => vip.display_name === name)
    const distance = contest.metrics.distance_to_cash.per_vip.find((vip: any) => vip.display_name === name)
    if (change.rank !== undefined) lineup.rank = change.rank
    if (change.pts !== undefined) lineup.pts = change.pts
    if (change.distancePoints !== undefined) distance.points_delta = change.distancePoints
    if (change.distanceRank !== undefined) distance.rank_delta = change.distanceRank
  }
  edit(snapshot)
  const result = buildLiveModel(snapshot, 'nfl')
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const KEY = { empire: '5275499864', cubbies: '5280114900', tuck: '5280874445' }

export function seededFeed(clockAt = T0) {
  let clock = clockAt
  const feed = createShiftsFeed({ storage: memoryStorage(), now: () => clock })
  feed.record(nflModel(), { visit: true })
  return {
    feed,
    at(time: number) {
      clock = time
    },
  }
}

export function vipItems(feed: ReturnType<typeof createShiftsFeed>) {
  return feed.feed().filter((item): item is VipShiftItem => item.kind === 'vip')
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const LAWRENCE = 'nfl:trevor-lawrence:jax:5900:qb'
export const HIGBEE = 'nfl:tyler-higbee:lar:3100:te'

/** Edits one pool player's figures (points, game status, stats line). */
export function pooled(snapshot: any, playerKey: string, patch: Record<string, unknown>) {
  const player = snapshot.sports.nfl.players.find((row: any) => row.player_key === playerKey)
  Object.assign(player, patch)
}

export function lineupOf(snapshot: any, name: string): any[] {
  return snapshot.sports.nfl.contests[0].vip_lineups.find((vip: any) => vip.display_name === name).players_live
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function cashLine(points: number, rank: number) {
  return (snapshot: any) => {
    const line = snapshot.sports.nfl.contests[0].live_metrics.cash_line
    line.points_cutoff = points
    line.rank_cutoff = rank
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// The seeded Seen mark has EmpireMaker2 just outside cashing (-0.3 points); the line is 31.24 points at rank 500.
export const INSIDE = { distancePoints: 0.5 }
export const OUTSIDE = { distancePoints: -0.5 }

export const MINUTE = 60_000

/* eslint-disable @typescript-eslint/no-explicit-any */
export function completed(snapshot: any) {
  snapshot.sports.nfl.contests[0].state = 'completed'
}
/* eslint-enable @typescript-eslint/no-explicit-any */
