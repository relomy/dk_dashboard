import { keepPreviousData, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from '../lib/api'
import { interpretSnapshot, isSupportedSnapshot, unsupportedVersion } from '../lib/interpretedSnapshot'
import type { LatestResponse, Snapshot } from '../lib/types'

/** What a caller sees of a snapshot: exactly one of these. */
export type SnapshotOutcome =
  | { kind: 'loading' }
  | { kind: 'error'; error: Error }
  | { kind: 'unsupported'; version: string }
  | { kind: 'ready'; snapshot: Snapshot }

/** What the Latest reader adds to a ready snapshot: the path the pointer names, and a way to re-read the pointer. */
export type LatestSnapshotOutcome =
  | Exclude<SnapshotOutcome, { kind: 'ready' }>
  | (Extract<SnapshotOutcome, { kind: 'ready' }> & { latestPath: string; refresh: () => Promise<unknown> })

/** The Latest pointer refreshes on its own schedule. */
const latestPointerOptions = queryOptions({
  queryKey: ['latest'],
  queryFn: () => fetchJson<LatestResponse>('/api/latest'),
  staleTime: 60_000,
  refetchInterval: 300_000,
})

/** One snapshot path: fetched and interpreted once, shared by every page that reads it. */
function snapshotOptions(path: string | undefined) {
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

/** How a caller overrides the immutable-snapshot defaults of `snapshotOptions`. */
export interface SnapshotReadOptions {
  staleTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnReconnect?: boolean
  /** Keep the previous path's snapshot `ready` while the next path downloads. */
  keepPrevious?: boolean
}

function errorOutcome(failure: unknown): { kind: 'error'; error: Error } {
  return { kind: 'error', error: failure instanceof Error ? failure : new Error(String(failure)) }
}

/**
 * A snapshot at a chosen path: fetch, interpret and gate. Latest and History both read through this.
 * `loading` also covers "no path yet". `refetch` re-downloads the same path on request.
 */
export function useSnapshotAt(
  path: string | undefined,
  { keepPrevious, ...overrides }: SnapshotReadOptions = {},
): { outcome: SnapshotOutcome; refetch: () => Promise<unknown> } {
  const query = useQuery({
    ...snapshotOptions(path),
    ...overrides,
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  })
  const refetch = () => query.refetch()
  if (query.error) return { outcome: errorOutcome(query.error), refetch }
  if (query.data) {
    return {
      outcome: isSupportedSnapshot(query.data)
        ? { kind: 'ready', snapshot: query.data }
        : { kind: 'unsupported', version: unsupportedVersion(query.data) },
      refetch,
    }
  }
  return { outcome: { kind: 'loading' }, refetch }
}

/**
 * The snapshot the Latest pointer names. The previous snapshot stays `ready` while the next one downloads.
 * A ready outcome also carries `latestPath` (what the pointer names now) and `refresh` (re-read the
 * pointer; a new path then loads its snapshot).
 */
export function useLatestSnapshot(): LatestSnapshotOutcome {
  const queryClient = useQueryClient()
  const pointer = useQuery(latestPointerOptions)
  const path = pointer.data?.latest_snapshot_path
  const { outcome } = useSnapshotAt(path, { keepPrevious: true })

  if (pointer.error) return errorOutcome(pointer.error)
  if (pointer.data && !path) return errorOutcome(new Error('Snapshot not available.'))
  if (outcome.kind !== 'ready') return outcome
  const refresh = () => queryClient.refetchQueries({ queryKey: latestPointerOptions.queryKey })
  return { ...outcome, latestPath: path!, refresh }
}
