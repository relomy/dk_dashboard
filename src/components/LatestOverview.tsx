import { filterVipLineups } from '../lib/vipMatcher'
import type { ProfileMatchRules } from '../lib/profiles'
import StatusBadge from './StatusBadge'
import type { Snapshot } from '../lib/types'

interface LatestOverviewProps {
  snapshot: Snapshot
  vipFilterMode: 'all' | 'active'
  activeProfileRules: ProfileMatchRules
}

function LatestOverview({ snapshot, vipFilterMode, activeProfileRules }: LatestOverviewProps) {
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
            {data.contests.map((contest) => {
              const lineups = filterVipLineups(contest.vip_lineups, activeProfileRules, vipFilterMode)

              return (
                <div key={contest.contest_key}>
                  <p>Contest: {contest.name}</p>
                  {lineups.length === 0 ? (
                    <p>No matching VIP lineups.</p>
                  ) : (
                    <ul>
                      {lineups.map((lineup) => (
                        <li key={lineup.vip_entry_key}>{lineup.display_name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </article>
        ))}
      </div>
    </section>
  )
}

export default LatestOverview
