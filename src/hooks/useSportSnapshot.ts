import { isSupportedSnapshot } from '../lib/interpretedSnapshot'
import { useLatest } from './useLatest'

/** The latest snapshot for routes that show every sport; it follows the latest pointer, like Live. */
export function useSportSnapshot() {
  const { latestQuery, snapshotQuery } = useLatest()

  return {
    snapshot: snapshotQuery.data && isSupportedSnapshot(snapshotQuery.data) ? snapshotQuery.data : undefined,
    unsupportedVersion: snapshotQuery.data && !isSupportedSnapshot(snapshotQuery.data) ? snapshotQuery.data.schema_version : undefined,
    loading: latestQuery.isLoading || snapshotQuery.isLoading,
    error: latestQuery.error ?? snapshotQuery.error,
  }
}
