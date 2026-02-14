import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import KeyGate from '../components/KeyGate'
import LatestOverview from '../components/LatestOverview'
import StatusBadge from '../components/StatusBadge'
import { useProfiles } from '../context/ProfileContext'
import { useHistorySnapshot } from '../hooks/useHistorySnapshot'
import { useHistoryTimeline } from '../hooks/useHistoryTimeline'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'
import { formatHistoryTimestampForUrl } from '../lib/time'

function History() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { activeProfile } = useProfiles()
  const { timestamp: timestampParam } = useParams()
  const [apiKey, setApiKey] = useState('')
  const [sportFilter, setSportFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')

  useEffect(() => {
    setApiKey(getStoredKey())
  }, [])

  const { timestamp, manifestPath, manifestQuery, snapshotQuery, snapshotNotFound } = useHistorySnapshot(
    apiKey,
    timestampParam,
  )
  const timeline = useHistoryTimeline(apiKey, !timestampParam)

  const handleSaveKey = (key: string, mode: StorageMode) => {
    storeKey(key, mode)
    setApiKey(key)
    queryClient.clear()
  }

  const handleChangeKey = () => {
    clearKey()
    setApiKey('')
    queryClient.clear()
  }

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
    if (!apiKey) {
      return <KeyGate onSave={handleSaveKey} />
    }

    if (timeline.latestQuery.isLoading || timeline.todayManifestQuery.isLoading) {
      return <p>Loading history timeline...</p>
    }

    if (timeline.latestQuery.error || timeline.todayManifestQuery.error) {
      const message =
        timeline.latestQuery.error instanceof Error
          ? timeline.latestQuery.error.message
          : timeline.todayManifestQuery.error instanceof Error
            ? timeline.todayManifestQuery.error.message
            : 'Unable to load timeline.'

      return (
        <section>
          <h1>History</h1>
          <p className="error-text">{message}</p>
          <button type="button" onClick={handleChangeKey}>
            Change key
          </button>
        </section>
      )
    }

    return (
      <section>
        <div className="inline-actions">
          <button
            type="button"
            onClick={() => {
              if (!timeline.latestQuery.data?.snapshot_at) {
                return
              }
              navigate(`/history/${formatHistoryTimestampForUrl(timeline.latestQuery.data.snapshot_at)}`)
            }}
          >
            Jump to latest
          </button>
          {timeline.yesterdayManifestPath ? (
            <button type="button" onClick={() => timeline.yesterdayManifestQuery.refetch()}>
              Load yesterday
            </button>
          ) : null}
        </div>

        <h1>History</h1>
        <div>
          <label htmlFor="history-sport-filter">Sport filter</label>{' '}
          <select
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
          </select>{' '}
          <label htmlFor="history-state-filter">State filter</label>{' '}
          <select
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
          </select>
        </div>

        <ul>
          {filteredSnapshots.map((item) => (
            <li key={item.snapshot_at}>
              <button
                type="button"
                onClick={() => navigate(`/history/${formatHistoryTimestampForUrl(item.snapshot_at)}`)}
              >
                {new Date(item.snapshot_at).toLocaleString()}
              </button>
              <p>Sports: {item.sports_present.join(', ') || '-'}</p>
              <div>
                {Object.entries(item.sports_status ?? {}).map(([sport, details]) => (
                  <span key={`${item.snapshot_at}-${sport}`}>
                    {sport}: <StatusBadge status={details.status} />{' '}
                  </span>
                ))}
              </div>
              <p>
                Contest counts:{' '}
                {Object.entries(item.contest_counts_by_sport ?? {})
                  .map(([sport, count]) => `${sport} ${count}`)
                  .join(', ') || '-'}
              </p>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (!apiKey) {
    return <KeyGate onSave={handleSaveKey} />
  }

  if (manifestQuery.isLoading || snapshotQuery.isLoading) {
    return <p>Loading historical snapshot...</p>
  }

  if (manifestQuery.error || snapshotQuery.error) {
    const message =
      manifestQuery.error instanceof Error
        ? manifestQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : 'Unable to load historical snapshot.'

    return (
      <section>
        <h1>History</h1>
        <p className="error-text">{message}</p>
        <button type="button" onClick={handleChangeKey}>
          Change key
        </button>
      </section>
    )
  }

  if (snapshotNotFound) {
    return (
      <section>
        <h1>History</h1>
        <p>Snapshot not found for {timestamp}.</p>
        <p>Manifest checked: {manifestPath}</p>
      </section>
    )
  }

  if (!snapshotQuery.data) {
    return <p>Snapshot not available.</p>
  }

  return (
    <section>
      <div className="inline-actions">
        <button type="button" onClick={() => snapshotQuery.refetch()}>
          Refresh
        </button>
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>
      <LatestOverview
        snapshot={snapshotQuery.data}
        vipFilterMode="all"
        activeProfileRules={activeProfile.rules}
      />
    </section>
  )
}

export default History
