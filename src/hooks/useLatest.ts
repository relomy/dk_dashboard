import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import type { LatestResponse, Snapshot } from '../lib/types'

export function useLatest() {
  const latestQuery = useQuery({
    queryKey: ['latest'],
    queryFn: () => fetchJson<LatestResponse>('/api/latest'),
    staleTime: 60_000,
    refetchInterval: 300_000,
  })

  const snapshotQuery = useQuery({
    queryKey: ['snapshot', latestQuery.data?.latest_snapshot_path],
    enabled: Boolean(latestQuery.data?.latest_snapshot_path),
    queryFn: () =>
      fetchJson<Snapshot>(
        `/api/snapshot?path=${encodeURIComponent(latestQuery.data!.latest_snapshot_path)}`,
      ),
    staleTime: 60_000,
    refetchInterval: 300_000,
  })

  return {
    latestQuery,
    snapshotQuery,
  }
}
