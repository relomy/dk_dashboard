import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTimelineSource } from '../context/TimelineSourceContext'
import { TIMELINE_REFRESH_MS } from '../lib/timelineConfig'
import type { TimelineOpening } from '../lib/timelineSource'

/** Opens the Timeline for `sport` through the current source: the result, the loading progress and a retry. */
export function useShiftsTimeline(sport: string) {
  const source = useTimelineSource()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const queryClient = useQueryClient()
  const queryKey = ['shifts-timeline', sport]
  const query = useQuery({
    queryKey,
    queryFn: () => source.open(sport, { onProgress: (done, total) => setProgress({ done, total }) }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const retry = useCallback(() => {
    setProgress(null)
    void query.refetch()
  }, [query])
  /** Refetches one failed snapshot and swaps the rebuilt Timeline in; the rest of the rail is untouched. */
  const retryGap = useCallback(
    async (snapshotAt: string) => {
      const current = query.data
      if (current?.kind !== 'ready' || !current.retryGap) return
      queryClient.setQueryData(queryKey, await current.retryGap(snapshotAt))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, queryClient, sport],
  )
  /**
   * Keeps an open Timeline current: re-reads the manifest every `TIMELINE_REFRESH_MS` while the page is visible,
   * adds only the unseen snapshots, and pauses while hidden, catching up on return once an interval has passed.
   */
  const live = query.data?.kind === 'ready'
  useEffect(() => {
    if (!live) return
    let timer: ReturnType<typeof setInterval> | undefined
    let lastRefresh = Date.now()
    let refreshing = false
    const refreshNow = async () => {
      const current = queryClient.getQueryData<TimelineOpening>(queryKey)
      if (refreshing || current?.kind !== 'ready' || !current.refresh) return
      refreshing = true
      try {
        const next = await current.refresh()
        // A retry that landed meanwhile owns the cache; the next poll catches up.
        if (next !== current && queryClient.getQueryData(queryKey) === current) queryClient.setQueryData(queryKey, next)
      } catch {
        // The Timeline on screen stays; the next poll tries again.
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
      timer = setInterval(() => void refreshNow(), TIMELINE_REFRESH_MS)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') return stop()
      if (Date.now() - lastRefresh >= TIMELINE_REFRESH_MS) void refreshNow()
      start()
    }
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, queryClient, sport])
  return { opening: query.data, error: query.error, loading: query.isPending, progress, retry, retryGap }
}
