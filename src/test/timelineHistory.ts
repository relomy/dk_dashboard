import nflSnapshot from '../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import type { TimelineHistory } from '../lib/timelineSource'
import type { DayManifest, LatestResponse, ManifestSnapshotSummary } from '../lib/types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any

const MINUTE = 5
export const stamp = (index: number) => new Date(Date.UTC(2026, 9, 4, 18, index * MINUTE)).toISOString().replace('.000Z', 'Z')
export const pathOf = (index: number) => `snapshots/live-${index}.json`

/** The NFL fixture as the snapshot published at slot `index`, the first VIP moving 10 ranks and 5 points per slot. */
export function snapshotAt(index: number, mutate: (snapshot: Json) => void = () => {}): Json {
  const snapshot: Json = structuredClone(nflSnapshot)
  snapshot.snapshot_at = stamp(index)
  const vip = snapshot.sports.nfl.contests[0].vip_lineups[0]
  vip.rank = 600 - index * 10
  vip.points = 30 + index * 5
  // A second VIP drifts at its own pace, so two Profiles following different VIPs see different rows.
  const second = snapshot.sports.nfl.contests[0].vip_lineups[1]
  second.rank = 700 - index * 8
  second.points = 20 + index * 4
  mutate(snapshot)
  return snapshot
}

function entry(index: number, status: 'ok' | 'stale' = 'ok'): ManifestSnapshotSummary {
  return {
    snapshot_at: stamp(index),
    path: pathOf(index),
    sports_present: ['nfl'],
    contest_counts_by_sport: { nfl: 1 },
    state_counts: {},
    sports_status: { nfl: { status, updated_at: stamp(index) } },
  }
}

export interface StubOptions {
  slots?: number[]
  stale?: number[]
  failing?: number[]
  mutate?: Record<number, (snapshot: Json) => void>
  manifestError?: boolean
}

/** A stubbed History: a manifest of the given slots (oldest to newest) and snapshots generated on demand. */
export function stubHistory(options: StubOptions = {}) {
  const slots = options.slots ?? [0, 1, 2, 3, 4, 5, 6]
  const calls = { snapshots: [] as string[], manifests: [] as string[], inFlight: 0, maxInFlight: 0 }
  const manifest: DayManifest = {
    manifest_version: 1,
    date_utc: '2026-10-04',
    generated_at: stamp(slots[slots.length - 1]),
    snapshots: slots.map((slot) => entry(slot, options.stale?.includes(slot) ? 'stale' : 'ok')),
  }
  const latest: LatestResponse = {
    latest_snapshot_path: pathOf(slots[slots.length - 1]),
    snapshot_at: stamp(slots[slots.length - 1]),
    generated_at: stamp(slots[slots.length - 1]),
    available_sports: ['nfl'],
    manifest_today_path: 'manifest/2026-10-04.json',
  }
  const history: TimelineHistory = {
    latest: async () => latest,
    manifest: async (path) => {
      calls.manifests.push(path)
      if (options.manifestError) throw new Error('manifest down')
      return manifest
    },
    snapshot: async (path) => {
      calls.snapshots.push(path)
      calls.inFlight += 1
      calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      calls.inFlight -= 1
      const slot = Number(/live-(\d+)/.exec(path)![1])
      if (options.failing?.includes(slot)) throw new Error(`snapshot ${slot} down`)
      return snapshotAt(slot, options.mutate?.[slot])
    },
  }
  return { history, calls }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
