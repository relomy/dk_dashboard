import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import type { LatestResponse, Snapshot } from '../lib/types'

export function useLatest(apiKey: string) {
  const latestQuery = useQuery({
    queryKey: ['latest'],
    enabled: Boolean(apiKey),
    queryFn: () => fetchJson<LatestResponse>('/api/latest', { apiKey }),
    staleTime: 60_000,
    refetchInterval: 300_000,
  })

  const snapshotQuery = useQuery({
    queryKey: ['snapshot', latestQuery.data?.latest_snapshot_path],
    enabled: Boolean(apiKey) && Boolean(latestQuery.data?.latest_snapshot_path),
    queryFn: () =>
      fetchJson<Snapshot>(
        `/api/snapshot?path=${encodeURIComponent(latestQuery.data!.latest_snapshot_path)}`,
        {
          apiKey,
        },
      ),
    staleTime: 60_000,
    refetchInterval: 300_000,
  })

  return {
    latestQuery,
    snapshotQuery,
  }
}
