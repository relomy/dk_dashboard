import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import { manifestWindowPaths, snapshotsNewestFirst } from '../lib/manifestWindow'
import type { DayManifest, LatestResponse } from '../lib/types'

export function useHistoryTimeline(enabled: boolean) {
  const latestQuery = useQuery({
    queryKey: ['latest'],
    enabled,
    queryFn: () => fetchJson<LatestResponse>('/api/latest'),
    staleTime: 60_000,
  })

  const range = latestQuery.data ? manifestWindowPaths(latestQuery.data) : undefined
  const todayManifestPath = range?.today
  const yesterdayManifestPath = range?.yesterday

  const todayManifestQuery = useQuery({
    queryKey: ['history-timeline-manifest', todayManifestPath],
    enabled: Boolean(todayManifestPath) && enabled,
    queryFn: () => fetchJson<DayManifest>(`/api/snapshot?path=${encodeURIComponent(todayManifestPath!)}`),
    staleTime: 300_000,
  })

  const yesterdayManifestQuery = useQuery({
    queryKey: ['history-timeline-manifest', yesterdayManifestPath],
    enabled: false,
    queryFn: () => fetchJson<DayManifest>(`/api/snapshot?path=${encodeURIComponent(yesterdayManifestPath!)}`),
    staleTime: 300_000,
  })

  const snapshots = useMemo(() => {
    return snapshotsNewestFirst(todayManifestQuery.data?.snapshots ?? [], yesterdayManifestQuery.data?.snapshots ?? [])
  }, [todayManifestQuery.data, yesterdayManifestQuery.data])

  return {
    latestQuery,
    todayManifestPath,
    todayManifestQuery,
    yesterdayManifestPath,
    yesterdayManifestQuery,
    snapshots,
  }
}
