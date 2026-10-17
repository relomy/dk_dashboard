import { fetchJson } from './api'
import { interpretSnapshot, isSupportedSnapshot } from './interpretedSnapshot'
import { buildLiveModel, type LiveNotRenderableReason } from './liveModel'
import { buildTimeline, digestOf, type Digest, type Timeline, type TimelineReach, type TimelineGapMarker, type TimelineInput } from './shifts'
import { TIMELINE_CAP, TIMELINE_FETCH_BOUND, TIMELINE_OPEN_SNAPSHOTS } from './timelineConfig'
import type { DayManifest, LatestResponse, ManifestSnapshotSummary } from './types'

/**
 * The Timeline's data source: fetches the manifests and snapshots, builds each snapshot's Live model, reduces it to
 * its digest and feeds the pure build. The UI depends only on `TimelineSource`, so a cheaper source (a condensed
 * series, a digest cache) can replace or wrap this one. Nothing is held between calls.
 */

/** Where the source reads History from; tests stub it. */
export interface TimelineHistory {
  latest(): Promise<LatestResponse>
  manifest(path: string): Promise<DayManifest>
  /** The raw snapshot JSON at a manifest path. */
  snapshot(path: string): Promise<unknown>
}

export interface TimelineOpenOptions {
  /** Called with (snapshots done, snapshots to load) as each one settles, for loading progress. */
  onProgress?: (done: number, total: number) => void
}

export type TimelineOpening =
  | {
      kind: 'ready'
      timeline: Timeline
      inputs: TimelineInput[]
      /**
       * Refetches the one skipped snapshot at `snapshotAt` and rebuilds. Resolves with an opening that still shows
       * the gap when the snapshot fails again, and with this opening itself for a snapshot that is not a failure.
       */
      retryGap?: (snapshotAt: string) => Promise<TimelineOpening>
      /**
       * Reads the manifests again and fetches only the snapshots newer than the newest loaded, adding their Steps at
       * the top. Resolves with this opening itself when nothing is new; rejects when the manifest cannot be read.
       */
      refresh?: () => Promise<TimelineOpening>
    }
  | { kind: 'not-renderable'; reason: LiveNotRenderableReason }

export interface TimelineSource {
  /**
   * Loads the newest snapshots for `sport` and builds the Timeline. Rejects when the manifest or the latest
   * snapshot cannot be fetched; an older snapshot that fails becomes a gap instead.
   */
  open(sport: string, options?: TimelineOpenOptions): Promise<TimelineOpening>
}

export interface TimelineSourceOptions {
  history: TimelineHistory
  /** The build clock stamped on each digest; defaults to `Date.now`. */
  now?: () => number
  /** Defaults to `TIMELINE_FETCH_BOUND`. */
  fetchBound?: number
  /** Defaults to `TIMELINE_OPEN_SNAPSHOTS`. */
  openSnapshots?: number
  /** The most snapshots held; new arrivals past it push the oldest off. Defaults to `TIMELINE_CAP`. */
  cap?: number
  /** Awaited after each snapshot is built so the main thread can paint; defaults to a macrotask. */
  yieldToMain?: () => Promise<void>
}

/** History over the app's own API. */
export const apiTimelineHistory: TimelineHistory = {
  latest: () => fetchJson<LatestResponse>('/api/latest'),
  manifest: (path) => fetchJson<DayManifest>(`/api/snapshot?path=${encodeURIComponent(path)}`),
  snapshot: (path) => fetchJson<unknown>(`/api/snapshot?path=${encodeURIComponent(path)}`),
}

const defaultYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Runs `task` over `items` with at most `bound` in flight, keeping the results in item order. */
async function mapBounded<T, R>(items: T[], bound: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(bound, 1), items.length) }, worker))
  return results
}

/** The manifests' snapshots, newest first, one per `snapshot_at`. */
function newestFirst(snapshots: ManifestSnapshotSummary[]): ManifestSnapshotSummary[] {
  const seen = new Set<string>()
  return [...snapshots]
    .sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))
    .filter((item) => !seen.has(item.snapshot_at) && seen.add(item.snapshot_at))
}

type Built =
  | { kind: 'digest'; input: TimelineInput }
  | { kind: 'not-renderable'; reason: LiveNotRenderableReason }
  | { kind: 'failed'; error: unknown }

function isGap(input: TimelineInput): input is TimelineGapMarker {
  return 'reason' in input
}

/**
 * Drops the digests whose primary contest differs from the newest digest's, so a rotated slate starts a fresh
 * Timeline, and the gaps left behind the rotation, which no Step could be compared across.
 */
function withoutRotation(inputs: TimelineInput[]): TimelineInput[] {
  const newest = [...inputs].reverse().find((input): input is Digest => !isGap(input))
  if (!newest) return inputs
  const kept = inputs.filter((input) => isGap(input) || input.contestKey === newest.contestKey)
  if (kept.length === inputs.length) return inputs
  return kept.slice(kept.findIndex((input) => !isGap(input)))
}

export function createTimelineSource(options: TimelineSourceOptions): TimelineSource {
  const { history } = options
  const now = options.now ?? Date.now
  const bound = options.fetchBound ?? TIMELINE_FETCH_BOUND
  const openSnapshots = options.openSnapshots ?? TIMELINE_OPEN_SNAPSHOTS
  const cap = options.cap ?? TIMELINE_CAP
  const yieldToMain = options.yieldToMain ?? defaultYield

  /** One snapshot to its digest; the raw snapshot is out of scope as soon as this returns. */
  async function digestFor(sport: string, entry: ManifestSnapshotSummary): Promise<Built> {
    try {
      const interpreted = interpretSnapshot(await history.snapshot(entry.path))
      if (!isSupportedSnapshot(interpreted)) throw new Error('Unsupported snapshot')
      const result = buildLiveModel(interpreted, sport)
      if (result.kind === 'not-renderable') return { kind: 'not-renderable', reason: result.reason }
      return { kind: 'digest', input: digestOf(result.model, now()) }
    } catch (error) {
      return { kind: 'failed', error }
    } finally {
      await yieldToMain()
    }
  }

  async function open(sport: string, openOptions: TimelineOpenOptions = {}): Promise<TimelineOpening> {
    const latest = await history.latest()
    const manifests = [await history.manifest(latest.manifest_today_path)]
    if (manifests[0].snapshots.length < openSnapshots && latest.manifest_yesterday_path) {
      // Yesterday only tops up a short day; failing to read it just leaves the Timeline shorter.
      manifests.push(await history.manifest(latest.manifest_yesterday_path).catch(() => ({ snapshots: [] }) as unknown as DayManifest))
    }
    const page = newestFirst(manifests.flatMap((manifest) => manifest.snapshots)).slice(0, openSnapshots)
    if (page.length === 0) throw new Error('The manifest lists no snapshots')

    const fresh = (entry: ManifestSnapshotSummary) => entry.sports_status?.[sport]?.status === 'ok'
    const toFetch = page.filter(fresh)
    let done = 0
    const fetched = new Map<string, Built>()
    await mapBounded(toFetch, bound, async (entry) => {
      fetched.set(entry.snapshot_at, await digestFor(sport, entry))
      openOptions.onProgress?.(++done, toFetch.length)
    })

    // The newest snapshot is the one the page is about: its failure fails the open.
    const newest = fetched.get(page[0].snapshot_at)
    if (newest?.kind === 'failed') throw newest.error instanceof Error ? newest.error : new Error('The latest snapshot failed to load')
    if (newest?.kind === 'not-renderable') return { kind: 'not-renderable', reason: newest.reason }

    const oldestFirst = [...page].reverse()
    const inputs: TimelineInput[] = oldestFirst.map((entry): TimelineInput => {
      const built = fetched.get(entry.snapshot_at)
      if (!built) return { reason: 'not-fresh', snapshotAt: entry.snapshot_at }
      return built.kind === 'digest' ? built.input : { reason: 'unavailable', snapshotAt: entry.snapshot_at }
    })
    const paths = new Map(oldestFirst.map((entry) => [entry.snapshot_at, entry.path]))
    return ready(sport, inputs, paths)
  }

  /** The snapshots newer than `after` (oldest first) as inputs: fetched when fresh, a gap when not or when they fail. */
  async function newerThan(sport: string, after: string): Promise<{ inputs: TimelineInput[]; paths: Map<string, string> }> {
    const latest = await history.latest()
    const today = await history.manifest(latest.manifest_today_path)
    const isNew = (entry: ManifestSnapshotSummary) => entry.snapshot_at > after
    let listed = today.snapshots.filter(isNew)
    // Just past UTC midnight the new day's manifest is short: while it cannot show everything unseen, yesterday does.
    const reachesBack = today.snapshots.length > 0 && today.snapshots.every(isNew)
    if ((reachesBack || today.snapshots.length === 0) && latest.manifest_yesterday_path) {
      const yesterday = await history.manifest(latest.manifest_yesterday_path).catch(() => null)
      listed = [...listed, ...(yesterday?.snapshots.filter(isNew) ?? [])]
    }
    const entries = newestFirst(listed).reverse()
    const built = await mapBounded(entries, bound, (entry) =>
      entry.sports_status?.[sport]?.status === 'ok' ? digestFor(sport, entry) : Promise.resolve(null),
    )
    const inputs = entries.map((entry, i): TimelineInput => {
      const result = built[i]
      if (!result) return { reason: 'not-fresh', snapshotAt: entry.snapshot_at }
      return result.kind === 'digest' ? result.input : { reason: 'unavailable', snapshotAt: entry.snapshot_at }
    })
    return { inputs, paths: new Map(entries.map((entry) => [entry.snapshot_at, entry.path])) }
  }

  /** The opening for `all` (oldest first): other contests dropped, and the gap retry wired to `paths`. */
  function ready(sport: string, all: TimelineInput[], paths: Map<string, string>, reach?: TimelineReach): TimelineOpening {
    const inputs = withoutRotation(all)
    const retryGap = async (snapshotAt: string): Promise<TimelineOpening> => {
      const path = paths.get(snapshotAt)
      const index = inputs.findIndex((input) => input.snapshotAt === snapshotAt)
      const gap = inputs[index]
      if (!path || !gap || !isGap(gap) || gap.reason !== 'unavailable') return opening
      const built = await digestFor(sport, { path, snapshot_at: snapshotAt } as ManifestSnapshotSummary)
      if (built.kind !== 'digest') return opening
      return ready(sport, inputs.map((input, i) => (i === index ? built.input : input)), paths, reach)
    }
    const refresh = async (): Promise<TimelineOpening> => {
      const newest = inputs[inputs.length - 1]
      const fresh = await newerThan(sport, newest.snapshotAt)
      if (fresh.inputs.length === 0) return opening
      let held = [...inputs, ...fresh.inputs]
      let reached = reach
      if (held.length > cap) {
        // New arrivals count toward the cap: the oldest drop off, and a leading gap has nothing to compare across.
        held = held.slice(held.length - cap)
        held = held.slice(Math.max(held.findIndex((input) => !isGap(input)), 0))
        reached = 'cap'
      }
      return ready(sport, held, new Map([...paths, ...fresh.paths]), reached)
    }
    const opening: TimelineOpening = { kind: 'ready', timeline: buildTimeline(inputs, { reach }), inputs, retryGap, refresh }
    return opening
  }

  return { open }
}
