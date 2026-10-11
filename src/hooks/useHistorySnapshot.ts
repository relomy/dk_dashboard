import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import { getUtcManifestDate, parseHistoryTimestamp } from '../lib/time'
import type { DayManifest } from '../lib/types'
import { useSnapshotAt, type SnapshotReadOptions } from './useSnapshot'

/** History re-checks a chosen snapshot on focus and reconnect once five minutes old; it never holds a previous one. */
const historyReadOptions: SnapshotReadOptions = {
  staleTime: 300_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
}

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
  const { outcome: snapshot, refetch: refetchSnapshot } = useSnapshotAt(snapshotPath, historyReadOptions)

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
