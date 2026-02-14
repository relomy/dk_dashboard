import { useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { filterVipLineups } from '../lib/vipMatcher'
import type { ProfileMatchRules } from '../lib/profiles'
import type { Contest, ContestState, Snapshot, SportSnapshot, VipLineup } from '../lib/types'
import StatusBadge from './StatusBadge'

interface LatestOverviewProps {
  snapshot: Snapshot
  vipFilterMode: 'all' | 'active'
  activeProfileRules: ProfileMatchRules
}

const orderedStates: ContestState[] = ['live', 'upcoming', 'completed', 'cancelled', 'unknown']

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function groupByState(contests: Contest[]): Record<ContestState, Contest[]> {
  const grouped: Record<ContestState, Contest[]> = {
    live: [],
    upcoming: [],
    completed: [],
    cancelled: [],
    unknown: [],
  }

  for (const contest of contests) {
    grouped[contest.state].push(contest)
  }

  return grouped
}

function formatContestState(state: ContestState): string {
  return state.charAt(0).toUpperCase() + state.slice(1)
}

function renderLineupSlots(lineup: VipLineup): string {
  return lineup.slots
    .map((slot) => {
      return `${slot.slot}:${slot.player_name}${slot.multiplier ? ` x${slot.multiplier}` : ''}`
    })
    .join(' | ')
}

function ContestBlock({ contest, lineups }: { contest: Contest; lineups: VipLineup[] }) {
  return (
    <article className="latest-contest">
      <div className="latest-contest-head">
        <strong>{contest.name}</strong>
        <span>{formatMoney(contest.entry_fee_cents, contest.currency)}</span>
        <span className={`contest-state-badge contest-state-${contest.state}`}>{formatContestState(contest.state)}</span>
      </div>
      <p className="latest-meta">
        Entries {contest.entries_count}/{contest.max_entries} | Prize {formatMoney(contest.prize_pool_cents, contest.currency)}
      </p>
      <div>
        <p className="latest-vip-label">VIP lineups</p>
        {lineups.length === 0 ? (
          <p className="latest-muted">No matching VIP lineups</p>
        ) : (
          <ul className="latest-vip-list">
            {lineups.map((lineup) => (
              <li key={lineup.vip_entry_key}>
                <strong>{lineup.display_name}</strong>
                <div className="latest-slot-line">{renderLineupSlots(lineup)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function LatestSportCard({
  sport,
  data,
  vipFilterMode,
  activeProfileRules,
}: {
  sport: string
  data: SportSnapshot
  vipFilterMode: 'all' | 'active'
  activeProfileRules: ProfileMatchRules
}) {
  const grouped = useMemo(() => groupByState(data.contests), [data.contests])
  const liveRef = useRef<HTMLElement | null>(null)
  const upcomingRef = useRef<HTMLDetailsElement | null>(null)
  const completedRef = useRef<HTMLDetailsElement | null>(null)
  const cancelledRef = useRef<HTMLDetailsElement | null>(null)
  const unknownRef = useRef<HTMLDetailsElement | null>(null)

  const firstNonLiveState = orderedStates.find((state) => state !== 'live' && grouped[state].length > 0)

  const detailsRefByState: Partial<Record<ContestState, RefObject<HTMLDetailsElement | null>>> = {
    upcoming: upcomingRef,
    completed: completedRef,
    cancelled: cancelledRef,
    unknown: unknownRef,
  }

  const jumpToState = (state: ContestState) => {
    if (state === 'live') {
      liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }

    const detailsRef = detailsRefByState[state]
    if (!detailsRef?.current) {
      return
    }

    detailsRef.current.open = true
    detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <article className="latest-sport-card">
      <div className="latest-sport-head">
        <h2 className="section-title">{sport.toUpperCase()}</h2>
        <StatusBadge status={data.status} />
      </div>

      <div className="latest-state-line">
        {orderedStates.map((state) => (
          <button
            key={`${sport}-${state}`}
            type="button"
            className="state-jump"
            onClick={() => jumpToState(state)}
            disabled={grouped[state].length === 0}
          >
            {formatContestState(state)} {grouped[state].length}
          </button>
        ))}
      </div>

      {grouped.live.length > 0 ? (
        <section ref={liveRef} className="page-stack-sm">
          <h3 className="subsection-title">Live Contests</h3>
          {grouped.live.map((contest) => {
            const lineups = filterVipLineups(contest.vip_lineups, activeProfileRules, vipFilterMode)
            return <ContestBlock key={contest.contest_key} contest={contest} lineups={lineups} />
          })}
        </section>
      ) : (
        <p className="latest-muted">No live contests right now</p>
      )}

      {orderedStates
        .filter((state) => state !== 'live')
        .map((state) => {
          const contests = grouped[state]
          if (contests.length === 0) {
            return null
          }

          const detailsRef = detailsRefByState[state]

          return (
            <details
              key={`${sport}-${state}`}
              ref={detailsRef}
              open={grouped.live.length === 0 && firstNonLiveState === state}
            >
              <summary>
                {formatContestState(state)} ({contests.length})
              </summary>
              {contests.map((contest) => {
                const lineups = filterVipLineups(contest.vip_lineups, activeProfileRules, vipFilterMode)
                return <ContestBlock key={contest.contest_key} contest={contest} lineups={lineups} />
              })}
            </details>
          )
        })}

      <details>
        <summary>Sport health</summary>
        <p className="latest-muted meta-text">Players tracked: {data.players.length}</p>
        <p className="latest-muted meta-text">Sport updated: {new Date(data.updated_at).toLocaleString()}</p>
        {data.error ? <p className="error-text">Error: {data.error}</p> : null}
      </details>
    </article>
  )
}

function LatestOverview({ snapshot, vipFilterMode, activeProfileRules }: LatestOverviewProps) {
  const sports = Object.entries(snapshot.sports)

  return (
    <section className="page-stack">
      <div className="section-header">
        <h1 className="page-title">Latest</h1>
        <p className="page-meta">Last updated: {new Date(snapshot.generated_at).toLocaleString()}</p>
      </div>

      <div className="latest-sports-grid">
        {sports.map(([sport, data]) => (
          <LatestSportCard
            key={sport}
            sport={sport}
            data={data}
            vipFilterMode={vipFilterMode}
            activeProfileRules={activeProfileRules}
          />
        ))}
      </div>
    </section>
  )
}

export default LatestOverview
