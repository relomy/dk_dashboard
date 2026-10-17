import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTimelineSource } from '../context/TimelineSourceContext'

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
  return { opening: query.data, error: query.error, loading: query.isPending, progress, retry, retryGap }
}
