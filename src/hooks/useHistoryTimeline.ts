import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import type { DayManifest, LatestResponse, ManifestSnapshotSummary } from '../lib/types'

function sortNewestFirst(items: ManifestSnapshotSummary[]): ManifestSnapshotSummary[] {
  return [...items].sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))
}

function dedupeByTimestamp(items: ManifestSnapshotSummary[]): ManifestSnapshotSummary[] {
  const seen = new Set<string>()
  const result: ManifestSnapshotSummary[] = []

  for (const item of items) {
    if (seen.has(item.snapshot_at)) {
      continue
    }
    seen.add(item.snapshot_at)
    result.push(item)
  }

  return result
}

export function useHistoryTimeline(enabled: boolean) {
  const latestQuery = useQuery({
    queryKey: ['latest'],
    enabled,
    queryFn: () => fetchJson<LatestResponse>('/api/latest'),
    staleTime: 60_000,
  })

  const todayManifestPath = latestQuery.data?.manifest_today_path
  const yesterdayManifestPath = latestQuery.data?.manifest_yesterday_path

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
    const combined = [
      ...(todayManifestQuery.data?.snapshots ?? []),
      ...(yesterdayManifestQuery.data?.snapshots ?? []),
    ]

    return sortNewestFirst(dedupeByTimestamp(combined))
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
