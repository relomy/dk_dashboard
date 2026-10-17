import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTimelineSource } from '../context/TimelineSourceContext'

/** Opens the Timeline for `sport` through the current source: the result, the loading progress and a retry. */
export function useShiftsTimeline(sport: string) {
  const source = useTimelineSource()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const query = useQuery({
    queryKey: ['shifts-timeline', sport],
    queryFn: () => source.open(sport, { onProgress: (done, total) => setProgress({ done, total }) }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const retry = useCallback(() => {
    setProgress(null)
    void query.refetch()
  }, [query])
  return { opening: query.data, error: query.error, loading: query.isPending, progress, retry }
}
