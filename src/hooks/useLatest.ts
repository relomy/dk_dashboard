import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { latestPointerOptions, snapshotOptions } from './useSnapshot'

/** The raw pointer and snapshot queries, for Live and Health until they move to `useLatestSnapshot`. */
export function useLatest() {
  const latestQuery = useQuery(latestPointerOptions)

  const snapshotQuery = useQuery({
    ...snapshotOptions(latestQuery.data?.latest_snapshot_path),
    // Keep showing the previous snapshot while the next path downloads, rather than flashing a loading state each cycle.
    placeholderData: keepPreviousData,
  })

  return {
    latestQuery,
    snapshotQuery,
  }
}
