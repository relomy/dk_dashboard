import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
    // A snapshot path is never rewritten (ADR-0001), so a loaded one can't go stale: a new path is a new key.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Keep showing the previous snapshot while the next path downloads, rather than flashing a loading state each cycle.
    placeholderData: keepPreviousData,
  })

  return {
    latestQuery,
    snapshotQuery,
  }
}
