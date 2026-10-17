import { fetchJson } from './api'
import { interpretSnapshot, isSupportedSnapshot } from './interpretedSnapshot'
import { buildLiveModel, type LiveNotRenderableReason } from './liveModel'
import { manifestWindowPaths, snapshotsNewestFirst } from './manifestWindow'
import { buildTimeline, digestOf, type Digest, type Timeline, type TimelineGapMarker, type TimelineInput, type TimelineReach } from './shifts'
import { TIMELINE_CAP, TIMELINE_FETCH_BOUND, TIMELINE_LOAD_MORE_SNAPSHOTS, TIMELINE_OPEN_SNAPSHOTS } from './timelineConfig'
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

/** How much of the window the Timeline holds, and why loading stopped (null while more can be loaded). */
export interface TimelineRange {
  /** Snapshots taken in so far, not-fresh and rotated-out ones included; counts toward the cap. */
  loaded: number
  cap: number
  reach: TimelineReach | null
}

export type TimelineOpening =
  | {
      kind: 'ready'
      timeline: Timeline
      inputs: TimelineInput[]
      range: TimelineRange
      /**
       * Loads the next page of snapshots further back and resolves with the longer Timeline. Absent once loading has
       * stopped (`range.reach`). Rejects, changing nothing, when a manifest it needs cannot be read.
       */
      loadMore?: (options?: TimelineOpenOptions) => Promise<TimelineOpening>
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
  /** Defaults to `TIMELINE_LOAD_MORE_SNAPSHOTS`. */
  loadMoreSnapshots?: number
  /** The most snapshots held, at either end: new arrivals past it push the oldest off. Defaults to `TIMELINE_CAP`. */
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

/** Everything a later "Load more" or gap retry needs; replaced, never mutated, so each opening stays valid. */
interface Loaded {
  sport: string
  /** Every digest and gap taken in, oldest first, before the rotation filter. */
  all: TimelineInput[]
  paths: Map<string, string>
  /** Manifest entries not yet taken in, newest first. */
  remaining: ManifestSnapshotSummary[]
  /** Snapshots taken in, counted toward the cap. */
  consumed: number
  yesterdayPath: string | undefined
  yesterdayRead: boolean
  /** An older snapshot of another contest was dropped, so the oldest kept one is the contest's start. */
  rotated: boolean
}

export function createTimelineSource(options: TimelineSourceOptions): TimelineSource {
  const { history } = options
  const now = options.now ?? Date.now
  const bound = options.fetchBound ?? TIMELINE_FETCH_BOUND
  const cap = options.cap ?? TIMELINE_CAP
  const openSnapshots = Math.min(options.openSnapshots ?? TIMELINE_OPEN_SNAPSHOTS, cap)
  const loadMoreSnapshots = options.loadMoreSnapshots ?? TIMELINE_LOAD_MORE_SNAPSHOTS
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

  /** Fetches the fresh entries of `page` within the bound; a not-fresh one is skipped without a download. */
  async function fetchPage(sport: string, page: ManifestSnapshotSummary[], onProgress: TimelineOpenOptions['onProgress']) {
    const fresh = (entry: ManifestSnapshotSummary) => entry.sports_status?.[sport]?.status === 'ok'
    const toFetch = page.filter(fresh)
    let done = 0
    const fetched = new Map<string, Built>()
    await mapBounded(toFetch, bound, async (entry) => {
      fetched.set(entry.snapshot_at, await digestFor(sport, entry))
      onProgress?.(++done, toFetch.length)
    })
    return fetched
  }

  /** The page as inputs, oldest first: a digest, or a gap for a snapshot that was skipped or failed. */
  function inputsOf(page: ManifestSnapshotSummary[], fetched: Map<string, Built>): TimelineInput[] {
    return [...page].reverse().map((entry): TimelineInput => {
      const built = fetched.get(entry.snapshot_at)
      if (!built) return { reason: 'not-fresh', snapshotAt: entry.snapshot_at }
      return built.kind === 'digest' ? built.input : { reason: 'unavailable', snapshotAt: entry.snapshot_at }
    })
  }

  async function open(sport: string, openOptions: TimelineOpenOptions = {}): Promise<TimelineOpening> {
    const latest = await history.latest()
    const window = manifestWindowPaths(latest)
    let listed = snapshotsNewestFirst((await history.manifest(window.today)).snapshots)
    let yesterdayRead = false
    if (listed.length < openSnapshots && window.yesterday) {
      // Yesterday only tops up a short day; failing to read it just leaves the Timeline shorter (a later
      // "Load more" tries it again).
      const yesterday = await history.manifest(window.yesterday).catch(() => null)
      if (yesterday) {
        listed = snapshotsNewestFirst(listed, yesterday.snapshots)
        yesterdayRead = true
      }
    }
    const page = listed.slice(0, openSnapshots)
    if (page.length === 0) throw new Error('The manifest lists no snapshots')

    const fetched = await fetchPage(sport, page, openOptions.onProgress)

    // The newest snapshot is the one the page is about: its failure fails the open.
    const newest = fetched.get(page[0].snapshot_at)
    if (newest?.kind === 'failed') throw newest.error instanceof Error ? newest.error : new Error('The latest snapshot failed to load')
    if (newest?.kind === 'not-renderable') return { kind: 'not-renderable', reason: newest.reason }

    return ready({
      sport,
      all: inputsOf(page, fetched),
      paths: new Map(page.map((entry) => [entry.snapshot_at, entry.path])),
      remaining: listed.slice(page.length),
      consumed: page.length,
      yesterdayPath: window.yesterday,
      yesterdayRead,
      rotated: false,
    })
  }

  /** The snapshots newer than `after` (oldest first) as inputs: fetched when fresh, a gap when not or when they fail. */
  async function newerThan(sport: string, after: string): Promise<{ inputs: TimelineInput[]; paths: Map<string, string> }> {
    const latest = await history.latest()
    const window = manifestWindowPaths(latest)
    const today = await history.manifest(window.today)
    const isNew = (entry: ManifestSnapshotSummary) => entry.snapshot_at > after
    let listed = today.snapshots.filter(isNew)
    // Just past UTC midnight the new day's manifest is short: while it cannot show everything unseen, yesterday does.
    const reachesBack = today.snapshots.length > 0 && today.snapshots.every(isNew)
    if ((reachesBack || today.snapshots.length === 0) && window.yesterday) {
      const yesterday = await history.manifest(window.yesterday).catch(() => null)
      listed = [...listed, ...(yesterday?.snapshots.filter(isNew) ?? [])]
    }
    const entries = snapshotsNewestFirst(listed).reverse()
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

  /** Takes in the next page of older snapshots, reading yesterday's manifest first when today's has run out. */
  async function loadMore(state: Loaded, loadOptions: TimelineOpenOptions = {}): Promise<TimelineOpening> {
    const count = Math.min(loadMoreSnapshots, cap - state.consumed)
    let { remaining, yesterdayRead } = state
    if (remaining.length < count && !yesterdayRead && state.yesterdayPath) {
      const yesterday = await history.manifest(state.yesterdayPath)
      const taken = new Set(state.paths.keys())
      remaining = snapshotsNewestFirst(remaining, yesterday.snapshots.filter((item) => !taken.has(item.snapshot_at)))
      yesterdayRead = true
    }
    const page = remaining.slice(0, count)
    const fetched = await fetchPage(state.sport, page, loadOptions.onProgress)
    return ready({
      ...state,
      all: [...inputsOf(page, fetched), ...state.all],
      paths: new Map([...state.paths, ...page.map((entry): [string, string] => [entry.snapshot_at, entry.path])]),
      remaining: remaining.slice(page.length),
      consumed: state.consumed + page.length,
      yesterdayRead,
    })
  }

  /** Takes in the snapshots newer than the newest held; new arrivals count toward the cap and push the oldest off. */
  async function refresh(state: Loaded, opening: TimelineOpening): Promise<TimelineOpening> {
    const newest = state.all[state.all.length - 1]
    const fresh = await newerThan(state.sport, newest.snapshotAt)
    if (fresh.inputs.length === 0) return opening
    let held = [...state.all, ...fresh.inputs]
    let consumed = state.consumed + fresh.inputs.length
    let hidden = state.consumed - state.all.length
    const excess = consumed - cap
    if (excess > 0) {
      // Rotated-out snapshots are the oldest, so they leave first; a leading gap has nothing to compare across.
      const hiddenDropped = Math.min(excess, hidden)
      hidden -= hiddenDropped
      held = held.slice(excess - hiddenDropped)
      held = held.slice(Math.max(held.findIndex((input) => !isGap(input)), 0))
      consumed = cap
    }
    return ready({
      ...state,
      all: held,
      paths: new Map([...state.paths, ...fresh.paths]),
      consumed,
      rotated: hidden > 0,
    })
  }

  /** Why loading has stopped, in the order the note should name it, or null while more can be loaded. */
  function reachOf(state: Loaded): TimelineReach | null {
    if (state.rotated) return 'contest-start'
    if (state.consumed >= cap) return 'cap'
    if (state.remaining.length === 0 && (state.yesterdayRead || !state.yesterdayPath)) return 'window'
    return null
  }

  /** The opening for `state`: other contests dropped, and Load more, refresh and the gap retry wired to it. */
  function ready(state: Loaded): TimelineOpening {
    const inputs = withoutRotation(state.all)
    const current: Loaded = { ...state, all: inputs, rotated: state.rotated || inputs !== state.all }
    const reach = reachOf(current)
    const retryGap = async (snapshotAt: string): Promise<TimelineOpening> => {
      const path = current.paths.get(snapshotAt)
      const index = inputs.findIndex((input) => input.snapshotAt === snapshotAt)
      const gap = inputs[index]
      if (!path || !gap || !isGap(gap) || gap.reason !== 'unavailable') return opening
      const built = await digestFor(current.sport, { path, snapshot_at: snapshotAt } as ManifestSnapshotSummary)
      if (built.kind !== 'digest') return opening
      return ready({ ...current, all: inputs.map((input, i) => (i === index ? built.input : input)) })
    }
    const opening: TimelineOpening = {
      kind: 'ready',
      timeline: buildTimeline(inputs, { reach: reach ?? 'window' }),
      inputs,
      range: { loaded: current.consumed, cap, reach },
      ...(reach === null ? { loadMore: (loadOptions?: TimelineOpenOptions) => loadMore(current, loadOptions) } : {}),
      retryGap,
      refresh: () => refresh(current, opening),
    }
    return opening
  }

  return { open }
}
