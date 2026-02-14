import StatusBadge from './StatusBadge'
import type { Snapshot } from '../lib/types'

interface LatestOverviewProps {
  snapshot: Snapshot
}

function LatestOverview({ snapshot }: LatestOverviewProps) {
  const sports = Object.entries(snapshot.sports)

  return (
    <section>
      <div className="section-header">
        <h1>Latest</h1>
        <p>Last updated: {new Date(snapshot.generated_at).toLocaleString()}</p>
      </div>
      <div className="sports-grid">
        {sports.map(([sport, data]) => (
          <article key={sport} className="sport-card">
            <div className="sport-card-top">
              <h2>{sport.toUpperCase()}</h2>
              <StatusBadge status={data.status} />
            </div>
            <p>Contests: {data.contests.length}</p>
            <p>Players: {data.players.length}</p>
            <p>Sport updated: {new Date(data.updated_at).toLocaleString()}</p>
            {data.error ? <p className="error-text">{data.error}</p> : null}
          </article>
        ))}
      </div>
    </section>
  )
}

export default LatestOverview
