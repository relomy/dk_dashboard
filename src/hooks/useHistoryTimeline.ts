import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import { useLatestPointer } from './useSnapshot'
import type { DayManifest, ManifestSnapshotSummary } from '../lib/types'

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
  const { pointer, isLoading, error } = useLatestPointer({ enabled })

  const todayManifestPath = pointer?.manifest_today_path
  const yesterdayManifestPath = pointer?.manifest_yesterday_path

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
    latest: { snapshotAt: pointer?.snapshot_at, isLoading, error },
    todayManifestPath,
    todayManifestQuery,
    yesterdayManifestPath,
    yesterdayManifestQuery,
    snapshots,
  }
}
