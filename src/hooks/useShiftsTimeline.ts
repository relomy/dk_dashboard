import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTimelineSource } from '../context/TimelineSourceContext'
import { SNAPSHOT_POLL_MS } from '../lib/pollInterval'
import type { TimelineOpening } from '../lib/timelineSource'

/** The state of a "Load more" in flight: its progress, its failure and the polite announcement for it. */
export interface LoadMoreState {
  busy: boolean
  progress: { done: number; total: number } | null
  error: string | null
  announcement: string
}

const idle: LoadMoreState = { busy: false, progress: null, error: null, announcement: '' }

/** The tail of each (client, sport) operation queue; it outlives a remount so an operation in flight keeps its place. */
const queues = new WeakMap<QueryClient, Map<string, Promise<unknown>>>()

/** The Load more in flight for each (client, sport), so a remounted hook neither starts a second one nor loses sight of it. */
const loadsInFlight = new WeakMap<QueryClient, Map<string, Promise<void>>>()

/** Keeps state per sport: a value set for another sport is ignored, and reading under a new sport gives `initial`. */
function useSportState<T>(sport: string, initial: T): [T, (update: T | ((prev: T) => T)) => void] {
  const [held, setHeld] = useState<{ sport: string; value: T }>({ sport, value: initial })
  const value = held.sport === sport ? held.value : initial
  const set = useCallback(
    (update: T | ((prev: T) => T)) =>
      setHeld((prev) => {
        const base = prev.sport === sport ? prev.value : initial
        return { sport, value: typeof update === 'function' ? (update as (prev: T) => T)(base) : update }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sport],
  )
  return [value, set]
}

/**
 * Runs `operation` after every earlier one for the same Timeline has finished, on the opening cached by then, and
 * caches what it returns. Retry, refresh and Load more therefore never write from a stale opening.
 */
function enqueue(
  client: QueryClient,
  queryKey: readonly unknown[],
  operation: (current: Extract<TimelineOpening, { kind: 'ready' }>) => Promise<TimelineOpening | null>,
): Promise<void> {
  const tails = queues.get(client) ?? new Map<string, Promise<unknown>>()
  queues.set(client, tails)
  const id = JSON.stringify(queryKey)
  const run = async () => {
    const current = client.getQueryData<TimelineOpening>(queryKey)
    if (current?.kind !== 'ready') return
    const next = await operation(current)
    if (next) client.setQueryData(queryKey, next)
  }
  const result = (tails.get(id) ?? Promise.resolve()).then(run)
  tails.set(
    id,
    result.catch(() => {}),
  )
  return result
}

/**
 * Opens the Timeline for `sport` through the current source: the result, the loading progress and a retry. The
 * opening stays cached across tab switches, growing by refresh and Load more, and is never replaced by a fresh open.
 */
export function useShiftsTimeline(sport: string) {
  const source = useTimelineSource()
  const [progress, setProgress] = useSportState<{ done: number; total: number } | null>(sport, null)
  const [refreshError, setRefreshError] = useSportState<Error | null>(sport, null)
  const queryClient = useQueryClient()
  const queryKey = ['shifts-timeline', sport]
  const query = useQuery({
    queryKey,
    queryFn: () => source.open(sport, { onProgress: (done, total) => setProgress({ done, total }) }),
    // Refresh and Load more keep the opening current; a refetch would throw the loaded rail away.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const retry = useCallback(() => {
    setProgress(null)
    void query.refetch()
  }, [query, setProgress])
  /** Refetches one failed snapshot and swaps the rebuilt Timeline in; resolves `{ ok: false }` when it still fails. */
  const retryGap = useCallback(
    async (snapshotAt: string): Promise<{ ok: boolean }> => {
      let ok = false
      await enqueue(queryClient, queryKey, async (current) => {
        if (!current.retryGap) return null
        const next = await current.retryGap(snapshotAt)
        ok =
          next.kind === 'ready' &&
          !next.timeline.entries.some(
            (entry) => entry.kind === 'gap' && entry.snapshotAt === snapshotAt && entry.reason === 'unavailable',
          )
        return next
      })
      return { ok }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, sport],
  )
  /**
   * Keeps an open Timeline current: re-reads the manifest every `SNAPSHOT_POLL_MS` while the page is visible,
   * adds only the unseen snapshots, and pauses while hidden, catching up on return once an interval has passed.
   * It also catches up on mount when the cached opening is older than an interval. Once the contest is completed
   * only the interval stops: the catch-up on mount and on return stays, so a Timeline kept open overnight, or a new
   * slate, does not stay stale.
   */
  const ready = query.data?.kind === 'ready'
  const completed = query.data?.kind === 'ready' && query.data.completed
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setInterval> | undefined
    let lastRefresh = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? Date.now()
    let refreshing = false
    const refreshNow = async () => {
      if (refreshing) return
      refreshing = true
      try {
        await enqueue(queryClient, queryKey, async (current) => (current.refresh ? current.refresh() : null))
        setRefreshError(null)
      } catch (error) {
        // The Timeline on screen stays; the next poll tries again.
        setRefreshError(error instanceof Error ? error : new Error('Could not refresh the Timeline.'))
      } finally {
        refreshing = false
        lastRefresh = Date.now()
      }
    }
    const stop = () => {
      clearInterval(timer)
      timer = undefined
    }
    const start = () => {
      stop()
      if (completed) return
      timer = setInterval(() => void refreshNow(), SNAPSHOT_POLL_MS)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') return stop()
      if (Date.now() - lastRefresh >= SNAPSHOT_POLL_MS) void refreshNow()
      start()
    }
    if (document.visibilityState !== 'hidden') {
      if (Date.now() - lastRefresh >= SNAPSHOT_POLL_MS) void refreshNow()
      start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, completed, queryClient, sport])
  const [more, setMore] = useSportState<LoadMoreState>(sport, idle)
  const loadKey = JSON.stringify(queryKey)
  /** Follows a Load more already in flight (started by an earlier mount) until it settles. */
  useEffect(() => {
    const running = loadsInFlight.get(queryClient)?.get(loadKey)
    if (!running) return
    setMore((prev) => (prev.busy ? prev : { ...prev, busy: true, announcement: 'Loading more snapshots' }))
    void running.then(() =>
      setMore((prev) => (prev.busy ? { busy: false, progress: null, error: null, announcement: '' } : prev)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, loadKey])
  /** Loads the next page further back and swaps the longer Timeline in; a failure leaves the rail as it was. */
  const loadMore = useCallback(async () => {
    const running = loadsInFlight.get(queryClient) ?? new Map<string, Promise<void>>()
    loadsInFlight.set(queryClient, running)
    if (running.has(loadKey)) return
    setMore({ busy: true, progress: null, error: null, announcement: 'Loading more snapshots' })
    const load = (async () => {
      try {
        let added = 0
        await enqueue(queryClient, queryKey, async (current) => {
          if (!current.loadMore) return null
          const next = await current.loadMore({
            onProgress: (done, total) => setMore((prev) => ({ ...prev, progress: { done, total } })),
          })
          added = next.kind === 'ready' ? next.range.loaded - current.range.loaded : 0
          return next
        })
        setMore({ busy: false, progress: null, error: null, announcement: `Loaded ${added} more snapshots` })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load more snapshots.'
        setMore({
          busy: false,
          progress: null,
          error: message,
          announcement: `Could not load more snapshots: ${message}`,
        })
      } finally {
        running.delete(loadKey)
      }
    })()
    running.set(loadKey, load)
    await load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, loadKey, setMore])
  return {
    opening: query.data,
    // An opening on screen is never replaced by an error; background failures arrive as `refreshError`.
    error: query.data ? null : query.error,
    refreshError,
    loading: query.isPending,
    progress,
    retry,
    retryGap,
    loadMore,
    more,
  }
}
