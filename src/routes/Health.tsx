import { useMemo } from 'react'
import StatusBadge from '../components/StatusBadge'
import { useHealth } from '../hooks/useHealth'

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
    return <p className="page">Loading health data...</p>
  }

  if (latestQuery.error || snapshotQuery.error) {
    const message =
      latestQuery.error instanceof Error
        ? latestQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : 'Unable to load health data.'

    return (
      <section className="page page-stack">
        <h1 className="page-title">Health</h1>
        <p className="error-text">{message}</p>
      </section>
    )
  }

  if (!snapshotQuery.data || !latestQuery.data) {
    return <p className="page">Health data unavailable.</p>
  }

  return (
    <section className="page page-stack">
      <div className="action-row">
        <button type="button" onClick={() => snapshotQuery.refetch()}>
          Refresh
        </button>
      </div>

      <h1 className="page-title">Health</h1>

      <div className="panel health-age-panel page-stack-sm">
        <p className="meta-text">Snapshot age</p>
        <p className="health-age-value">{formatAgeValue(snapshotAgeSeconds)}</p>
        <p className="meta-text">{snapshotAgeSeconds ?? 'unknown'} seconds since snapshot generation</p>
      </div>

      <div className="health-summary-grid">
        <article className="panel page-stack-sm">
          <h2 className="section-title">Sport status summary</h2>
          <p className="meta-text">ok: {statusCounts.ok}</p>
          <p className="meta-text">stale: {statusCounts.stale}</p>
          <p className="meta-text">error: {statusCounts.error}</p>
        </article>

        <article className="panel page-stack-sm">
          <h2 className="section-title">Snapshot context</h2>
          <p className="meta-text">Latest snapshot path: {latestQuery.data.latest_snapshot_path}</p>
          <p className="meta-text">Snapshot timestamp: {snapshotQuery.data.snapshot_at}</p>
          <p className="meta-text">Sports tracked: {sports.length}</p>
        </article>
      </div>

      <section className="panel page-stack-sm">
        <h2 className="section-title">Needs attention</h2>
        {flaggedSports.length === 0 ? (
          <p className="meta-text">No stale or error sports.</p>
        ) : (
          <ul className="list-panel">
            {flaggedSports.map((item) => (
              <li key={`flagged-${item.sport}`} className="item-card page-stack-sm health-flagged-item">
                <div className="health-flagged-head">
                  <p className="item-title">Flagged sport</p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="meta-text">Updated at: {new Date(item.updatedAt).toLocaleString()}</p>
                <p className="meta-text">
                  {item.error ? 'Error message available in per-sport details.' : 'No error message.'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel page-stack-sm">
        <h2 className="section-title">Per-sport details</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Sport</th>
              <th>Status</th>
              <th>Updated at</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {sports.map((item) => (
              <tr key={item.sport}>
                <td>{item.sport}</td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td>{item.updatedAt}</td>
                <td>
                  {item.error ? (
                    item.error.length > 80 ? (
                      <details>
                        <summary className="meta-text">{truncateText(item.error)}</summary>
                        <p className="meta-text">{item.error}</p>
                      </details>
                    ) : (
                      item.error
                    )
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  )
}

export default Health
