import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import type { LatestResponse, Snapshot } from '../lib/types'

function isSnapshot(value: unknown): value is Snapshot {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'sports' in value &&
      typeof (value as { sports?: unknown }).sports === 'object',
  )
}

function getCachedSnapshot(queryClient: ReturnType<typeof useQueryClient>): Snapshot | undefined {
  const snapshotEntries = queryClient.getQueriesData({ queryKey: ['snapshot'] })
  for (const [, value] of snapshotEntries) {
    if (isSnapshot(value)) {
      return value
    }
  }

  return undefined
}

export function useSportSnapshot(apiKey: string) {
  const queryClient = useQueryClient()
  const cachedSnapshot = getCachedSnapshot(queryClient)

  const latestQuery = useQuery({
    queryKey: ['latest'],
    enabled: Boolean(apiKey) && !cachedSnapshot,
    queryFn: () => fetchJson<LatestResponse>('/api/latest', { apiKey }),
    staleTime: 60_000,
  })

  const snapshotQuery = useQuery({
    queryKey: ['snapshot', latestQuery.data?.latest_snapshot_path],
    enabled: Boolean(apiKey) && !cachedSnapshot && Boolean(latestQuery.data?.latest_snapshot_path),
    queryFn: () =>
      fetchJson<Snapshot>(
        `/api/snapshot?path=${encodeURIComponent(latestQuery.data!.latest_snapshot_path)}`,
        {
          apiKey,
        },
      ),
    staleTime: 60_000,
  })

  return {
    snapshot: cachedSnapshot ?? snapshotQuery.data,
    loading: !cachedSnapshot && (latestQuery.isLoading || snapshotQuery.isLoading),
    error: latestQuery.error ?? snapshotQuery.error,
    usingCache: Boolean(cachedSnapshot),
  }
}
