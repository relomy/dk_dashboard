import { isSupportedSnapshot } from '../lib/interpretedSnapshot'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import DataPage from '../components/DataPage'
import StatusPill from '../components/StatusPill'
import { useHealth } from '../hooks/useHealth'
import { statusLabel, statusTone } from '../lib/sportStatus'

function formatAgeValue(snapshotAgeSeconds: number | null): string {
  if (snapshotAgeSeconds === null) {
    return 'Unknown'
  }

  if (snapshotAgeSeconds < 60) {
    return `${snapshotAgeSeconds}s`
  }

  const minutes = Math.floor(snapshotAgeSeconds / 60)
  const seconds = snapshotAgeSeconds % 60
  return `${minutes}m ${seconds}s`
}

function truncateText(value: string, max = 80): string {
  if (value.length <= max) {
    return value
  }

  return `${value.slice(0, max).trimEnd()}...`
}

const headCell = 'h-8 text-xs text-muted-foreground'

function Health() {
  const { latestQuery, snapshotQuery, snapshotAgeSeconds, sports } = useHealth()

  const statusCounts = useMemo(() => {
    const counts = { ok: 0, stale: 0, error: 0 }

    for (const sport of sports) {
      counts[sport.status] += 1
    }

    return counts
  }, [sports])

  const flaggedSports = useMemo(
    () => sports.filter((sport) => sport.status === 'stale' || sport.status === 'error'),
    [sports],
  )

  if (latestQuery.isLoading || snapshotQuery.isLoading) {
    return (
      <DataPage>
        <p className="text-muted-foreground">Loading health data...</p>
      </DataPage>
    )
  }

  if (latestQuery.error || snapshotQuery.error) {
    const message =
      latestQuery.error instanceof Error
        ? latestQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : 'Unable to load health data.'

    return (
      <DataPage title="Health">
        <p className="rounded-lg bg-non-cashing-muted px-3 py-2 text-non-cashing-foreground">{message}</p>
      </DataPage>
    )
  }

  if (snapshotQuery.data && !isSupportedSnapshot(snapshotQuery.data)) return <DataPage title="Health"><p>Unsupported snapshot schema version: {String(snapshotQuery.data.schema_version)}.</p></DataPage>

  if (!snapshotQuery.data || !latestQuery.data) {
    return (
      <DataPage>
        <p className="text-muted-foreground">Health data unavailable.</p>
      </DataPage>
    )
  }

  return (
    <DataPage
      title="Health"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => snapshotQuery.refetch()}>
          Refresh
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="card-surface flex flex-col gap-1 p-4">
          <p className="text-xs text-muted-foreground">Snapshot age</p>
          <p className="font-mono text-3xl font-semibold tabular-nums">{formatAgeValue(snapshotAgeSeconds)}</p>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {snapshotAgeSeconds ?? 'unknown'} seconds since snapshot generation
          </p>
        </div>

        <section aria-labelledby="health-summary-heading" className="card-surface flex flex-col gap-3 p-4">
          <h2 id="health-summary-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Sport status summary
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {(['ok', 'stale', 'error'] as const).map((status) => (
              <div
                key={status}
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg border px-3 py-2',
                  statusCounts[status] > 0
                    ? `${statusTone[status].border} ${statusTone[status].badge}`
                    : 'text-muted-foreground',
                )}
              >
                <p className="text-xs">{statusLabel[status]}</p>
                <p className="font-mono text-2xl font-semibold tabular-nums">{statusCounts[status]}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="health-attention-heading" className="card-surface flex flex-col gap-3 p-4">
        <h2 id="health-attention-heading" className="text-base font-semibold">
          Needs attention
        </h2>
        {flaggedSports.length === 0 ? (
          <p className="text-muted-foreground">No stale or error sports.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {flaggedSports.map((item) => (
              <li
                key={`flagged-${item.sport}`}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border border-l-4 bg-background/40 px-3 py-2',
                  statusTone[item.status].accentBorder,
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono font-semibold uppercase">{item.sport}</p>
                  <StatusPill status={item.status} />
                </div>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  Updated at: {new Date(item.updatedAt).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.error ? 'Error message available in per-sport details.' : 'No error message.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="health-details-heading" className="flex flex-col gap-3">
        <h2 id="health-details-heading" className="text-base font-semibold">
          Per-sport details
        </h2>
        <div className="card-surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headCell}>Sport</TableHead>
                <TableHead className={headCell}>Status</TableHead>
                <TableHead className={headCell}>Updated at</TableHead>
                <TableHead className={headCell}>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sports.map((item) => (
                <TableRow key={item.sport}>
                  <TableCell className="font-mono font-medium uppercase">{item.sport}</TableCell>
                  <TableCell>
                    <StatusPill status={item.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                    {item.updatedAt}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {item.error ? (
                      item.error.length > 80 ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            {truncateText(item.error)}
                          </summary>
                          <p className="mt-1 text-xs break-words text-muted-foreground">{item.error}</p>
                        </details>
                      ) : (
                        item.error
                      )
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="health-context-heading" className="card-surface flex flex-col gap-2 p-4">
        <h2 id="health-context-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Snapshot context
        </h2>
        <dl className="grid gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Latest snapshot path</dt>
          <dd className="break-all">{latestQuery.data.latest_snapshot_path}</dd>
          <dt className="text-muted-foreground">Snapshot timestamp</dt>
          <dd className="break-all">{snapshotQuery.data.snapshot_at}</dd>
          <dt className="text-muted-foreground">Sports tracked</dt>
          <dd>{sports.length}</dd>
        </dl>
      </section>
    </DataPage>
  )
}

export default Health
