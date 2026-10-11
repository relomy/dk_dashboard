import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import { interpretSnapshot, isSupportedSnapshot, unsupportedVersion } from '../lib/interpretedSnapshot'
import type { LatestResponse, Snapshot } from '../lib/types'

export { isSupportedSnapshot, unsupportedSnapshotMessage } from '../lib/interpretedSnapshot'

/** What a caller sees of a snapshot: exactly one of these. */
export type SnapshotOutcome =
  | { kind: 'loading' }
  | { kind: 'error'; error: Error }
  | { kind: 'unsupported'; version: string }
  | { kind: 'ready'; snapshot: Snapshot }

/** The Latest pointer refreshes on its own schedule. */
export const latestPointerOptions = queryOptions({
  queryKey: ['latest'],
  queryFn: () => fetchJson<LatestResponse>('/api/latest'),
  staleTime: 60_000,
  refetchInterval: 300_000,
})

/** One snapshot path: fetched and interpreted once, shared by every page that reads it. */
export function snapshotOptions(path: string | undefined) {
  return queryOptions({
    queryKey: ['snapshot', path],
    enabled: Boolean(path),
    queryFn: () => fetchJson<unknown>(`/api/snapshot?path=${encodeURIComponent(path!)}`).then(interpretSnapshot),
    // A snapshot path is never rewritten (ADR-0001), so a loaded one can't go stale: a new path is a new key.
    // Preserve the interpreter's root identity and raw provenance on explicit refetches.
    structuralSharing: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** The snapshot the Latest pointer names. The previous snapshot stays `ready` while the next one downloads. */
export function useLatestSnapshot(): SnapshotOutcome {
  const pointer = useQuery(latestPointerOptions)
  const path = pointer.data?.latest_snapshot_path
  const snapshot = useQuery({ ...snapshotOptions(path), placeholderData: keepPreviousData })

  const failure = pointer.error ?? snapshot.error
  if (failure) return { kind: 'error', error: failure instanceof Error ? failure : new Error(String(failure)) }
  if (snapshot.data) {
    return isSupportedSnapshot(snapshot.data)
      ? { kind: 'ready', snapshot: snapshot.data }
      : { kind: 'unsupported', version: unsupportedVersion(snapshot.data) }
  }
  if (pointer.data && !path) return { kind: 'error', error: new Error('Snapshot not available.') }
  return { kind: 'loading' }
}
