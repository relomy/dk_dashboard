import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import DataPage from '../components/DataPage'
import SnapshotOverview from '../components/SnapshotOverview'
import StatusPill from '../components/StatusPill'
import { useProfiles } from '../context/ProfileContext'
import { useHistorySnapshot } from '../hooks/useHistorySnapshot'
import { useHistoryTimeline } from '../hooks/useHistoryTimeline'
import { config } from '../lib/env'
import { formatHistoryTimestampForUrl } from '../lib/time'

function History() {
  const navigate = useNavigate()
  const { activeProfile } = useProfiles()
  const { timestamp: timestampParam } = useParams()
  const [sportFilter, setSportFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')

  const { timestamp, manifestPath, manifestQuery, snapshotQuery, snapshotNotFound } = useHistorySnapshot(timestampParam)
  const timeline = useHistoryTimeline(!timestampParam)

  const availableSports = useMemo(() => {
    const values = new Set<string>()
    for (const item of timeline.snapshots) {
      for (const sport of item.sports_present) {
        values.add(sport)
      }
      for (const sport of Object.keys(item.sports_status ?? {})) {
        values.add(sport)
      }
    }
    return Array.from(values).sort()
  }, [timeline.snapshots])

  const availableStates = useMemo(() => {
    const values = new Set<string>()
    for (const item of timeline.snapshots) {
      for (const state of Object.keys(item.state_counts ?? {})) {
        values.add(state)
      }
    }
    return Array.from(values).sort()
  }, [timeline.snapshots])

  const filteredSnapshots = useMemo(() => {
    return timeline.snapshots.filter((item) => {
      if (sportFilter !== 'all') {
        const inSportsPresent = item.sports_present.includes(sportFilter)
        const inStatus = Boolean(item.sports_status?.[sportFilter])
        if (!inSportsPresent && !inStatus) {
          return false
        }
      }

      if (stateFilter !== 'all') {
        const count = item.state_counts?.[stateFilter as keyof typeof item.state_counts] ?? 0
        if (!count) {
          return false
        }
      }

      return true
    })
  }, [timeline.snapshots, sportFilter, stateFilter])

  if (!timestampParam) {
    if (config.useMock && config.mockSnapshotOnly) {
      return (
        <DataPage title="History">
          <p>History requires manifest files.</p>
        </DataPage>
      )
    }

    if (timeline.latestQuery.isLoading || timeline.todayManifestQuery.isLoading) {
      return (
        <DataPage>
          <p className="text-muted-foreground">Loading history timeline...</p>
        </DataPage>
      )
    }

    if (timeline.latestQuery.error || timeline.todayManifestQuery.error) {
      const message =
        timeline.latestQuery.error instanceof Error
          ? timeline.latestQuery.error.message
          : timeline.todayManifestQuery.error instanceof Error
            ? timeline.todayManifestQuery.error.message
            : 'Unable to load timeline.'

      return (
        <DataPage title="History">
          <p className="rounded-lg bg-non-cashing-muted px-3 py-2 text-non-cashing-foreground">{message}</p>
        </DataPage>
      )
    }

    return (
      <DataPage
        title="History"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!timeline.latestQuery.data?.snapshot_at) {
                  return
                }
                navigate(`/history/${formatHistoryTimestampForUrl(timeline.latestQuery.data.snapshot_at)}`)
              }}
            >
              Jump to latest
            </Button>
            {timeline.yesterdayManifestPath ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => timeline.yesterdayManifestQuery.refetch()}
              >
                Load yesterday
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          <div className="grid w-fit min-w-36 gap-1">
            <Label htmlFor="history-sport-filter" className="text-xs font-normal text-muted-foreground">
              Sport filter
            </Label>
            <NativeSelect
              id="history-sport-filter"
              value={sportFilter}
              onChange={(event) => setSportFilter(event.target.value)}
            >
              <option value="all">All sports</option>
              {availableSports.map((sport) => (
                <option key={sport} value={sport}>
                  {sport}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid w-fit min-w-36 gap-1">
            <Label htmlFor="history-state-filter" className="text-xs font-normal text-muted-foreground">
              State filter
            </Label>
            <NativeSelect
              id="history-state-filter"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              <option value="all">All states</option>
              {availableStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {filteredSnapshots.length === 0 ? (
          <p className="text-muted-foreground">No snapshots match these filters.</p>
        ) : (
          <ul aria-label="Snapshots" className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {filteredSnapshots.map((item) => (
              <li
                key={item.snapshot_at}
                className="relative flex flex-col gap-1 px-3 py-2.5 focus-within:bg-muted/50 hover:bg-muted/50"
              >
                <Link
                  to={`/history/${formatHistoryTimestampForUrl(item.snapshot_at)}`}
                  className="w-fit font-mono text-sm font-medium tabular-nums underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:underline"
                >
                  {new Date(item.snapshot_at).toLocaleString()}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">
                  Sports: {item.sports_present.join(', ') || '-'}
                </p>
                <ul aria-label="Sport status" className="flex flex-wrap gap-x-4 gap-y-1">
                  {Object.entries(item.sports_status ?? {}).map(([sport, details]) => (
                    <li
                      key={`${item.snapshot_at}-${sport}`}
                      className="inline-flex items-center gap-1.5 font-mono text-xs"
                    >
                      {sport}: <StatusPill status={details.status} />
                    </li>
                  ))}
                </ul>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  Contest counts:{' '}
                  {Object.entries(item.contest_counts_by_sport ?? {})
                    .map(([sport, count]) => `${sport} ${count}`)
                    .join(', ') || '-'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DataPage>
    )
  }

  if (config.useMock && config.mockSnapshotOnly) {
    return (
      <DataPage title="History">
        <p>History requires manifest files.</p>
      </DataPage>
    )
  }

  if (manifestQuery.isLoading || snapshotQuery.isLoading) {
    return (
      <DataPage>
        <p className="text-muted-foreground">Loading historical snapshot...</p>
      </DataPage>
    )
  }

  if (manifestQuery.error || snapshotQuery.error) {
    const message =
      manifestQuery.error instanceof Error
        ? manifestQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : 'Unable to load historical snapshot.'

    return (
      <DataPage title="History">
        <p className="rounded-lg bg-non-cashing-muted px-3 py-2 text-non-cashing-foreground">{message}</p>
      </DataPage>
    )
  }

  if (snapshotNotFound) {
    return (
      <DataPage title="History">
        <p>Snapshot not found for {timestamp}.</p>
        <p className="font-mono text-xs break-all text-muted-foreground">Manifest checked: {manifestPath}</p>
      </DataPage>
    )
  }

  if (!snapshotQuery.data) {
    return (
      <DataPage>
        <p className="text-muted-foreground">Snapshot not available.</p>
      </DataPage>
    )
  }

  return (
    <DataPage
      title="History"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => snapshotQuery.refetch()}>
          Refresh
        </Button>
      }
    >
      <SnapshotOverview
        snapshot={snapshotQuery.data}
        vipFilterMode="all"
        activeProfileRules={activeProfile.rules}
      />
    </DataPage>
  )
}

export default History
