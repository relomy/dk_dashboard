import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import { getUtcManifestDate, parseHistoryTimestamp } from '../lib/time'
import type { DayManifest } from '../lib/types'
import { useSnapshotAt } from './useSnapshot'

export function useHistorySnapshot(timestampParam?: string) {
  const timestamp = timestampParam ? parseHistoryTimestamp(timestampParam) : ''
  const manifestDate = timestamp ? getUtcManifestDate(timestamp) : ''
  const manifestPath = manifestDate ? `manifest/${manifestDate}.json` : ''

  const manifestQuery = useQuery({
    queryKey: ['history-manifest', manifestPath],
    enabled: Boolean(manifestPath),
    queryFn: () => fetchJson<DayManifest>(`/api/snapshot?path=${encodeURIComponent(manifestPath)}`),
    staleTime: 300_000,
  })

  const snapshotPath = manifestQuery.data?.snapshots?.find((item) => item.snapshot_at === timestamp)?.path
  const { outcome: snapshot, refetch: refetchSnapshot } = useSnapshotAt(snapshotPath, 'history')

  const snapshotNotFound = Boolean(timestamp) && Boolean(manifestQuery.data) && !snapshotPath

  return {
    timestamp,
    manifestPath,
    manifestQuery,
    snapshotPath,
    snapshot,
    refetchSnapshot,
    snapshotNotFound,
  }
}
