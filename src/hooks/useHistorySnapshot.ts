import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import { getUtcManifestDate, parseHistoryTimestamp } from '../lib/time'
import type { DayManifest, Snapshot } from '../lib/types'

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

  const snapshotQuery = useQuery({
    queryKey: ['history-snapshot', snapshotPath],
    enabled: Boolean(snapshotPath),
    queryFn: () => fetchJson<Snapshot>(`/api/snapshot?path=${encodeURIComponent(snapshotPath!)}`),
    staleTime: 300_000,
  })

  const snapshotNotFound = Boolean(timestamp) && Boolean(manifestQuery.data) && !snapshotPath

  return {
    timestamp,
    manifestPath,
    manifestQuery,
    snapshotQuery,
    snapshotNotFound,
  }
}
