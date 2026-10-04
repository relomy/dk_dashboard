import { useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { contestStates, formatContestState, groupContestsByState } from '../lib/contestDisplay'
import type { ProfileMatchRules } from '../lib/profiles'
import type { ContestState, Snapshot, SportSnapshot } from '../lib/types'
import { filterVipLineups } from '../lib/vipMatcher'
import ContestCard from './ContestCard'
import StatusPill from './StatusPill'

interface SnapshotOverviewProps {
  snapshot: Snapshot
  vipFilterMode: 'all' | 'active'
  activeProfileRules: ProfileMatchRules
}

const orderedStates: ContestState[] = ['live', ...contestStates.filter((state) => state !== 'live')]

function SportSection({
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
  const grouped = useMemo(() => groupContestsByState(data.contests), [data.contests])
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
    <article className="card-surface flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-base font-semibold">{sport.toUpperCase()}</h2>
        <div className="flex items-center gap-3">
          <StatusPill status={data.status} />
          <Link
            to={`/live/${sport}`}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Live view
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {orderedStates.map((state) => (
          <Button
            key={`${sport}-${state}`}
            type="button"
            variant="outline"
            size="xs"
            className="font-mono tabular-nums"
            onClick={() => jumpToState(state)}
            disabled={grouped[state].length === 0}
          >
            {formatContestState(state)} {grouped[state].length}
          </Button>
        ))}
      </div>

      {grouped.live.length > 0 ? (
        <section ref={liveRef} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Live Contests</h3>
          {grouped.live.map((contest, contestIndex) => (
            <ContestCard
              key={contest.contest_key || `live-${contestIndex}`}
              contest={contest}
              lineups={filterVipLineups(contest.vip_lineups, activeProfileRules, vipFilterMode)}
              wholeDollars
            />
          ))}
        </section>
      ) : (
        <p className="text-muted-foreground">No live contests right now</p>
      )}

      {orderedStates
        .filter((state) => state !== 'live')
        .map((state) => {
          const contests = grouped[state]
          if (contests.length === 0) {
            return null
          }

          return (
            <details
              key={`${sport}-${state}`}
              ref={detailsRefByState[state]}
              open={grouped.live.length === 0 && firstNonLiveState === state}
              className="flex flex-col gap-2"
            >
              <summary className="cursor-pointer text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {formatContestState(state)} ({contests.length})
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {contests.map((contest, contestIndex) => (
                  <ContestCard
                    key={contest.contest_key || `${state}-${contestIndex}`}
                    contest={contest}
                    lineups={filterVipLineups(contest.vip_lineups, activeProfileRules, vipFilterMode)}
                    wholeDollars
                  />
                ))}
              </div>
            </details>
          )
        })}

      <details>
        <summary className="cursor-pointer text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sport health
        </summary>
        <div className="mt-2 flex flex-col gap-1 font-mono text-xs text-muted-foreground tabular-nums">
          <p>Players tracked: {data.players.length}</p>
          <p>Sport updated: {new Date(data.updated_at).toLocaleString()}</p>
          {data.error ? (
            <p className="rounded-lg bg-non-cashing-muted px-3 py-2 font-sans text-sm text-non-cashing-foreground">
              Error: {data.error}
            </p>
          ) : null}
        </div>
      </details>
    </article>
  )
}

/** A snapshot's sports with their contests and VIP lineups, for the History snapshot view. */
function SnapshotOverview({ snapshot, vipFilterMode, activeProfileRules }: SnapshotOverviewProps) {
  return (
    <>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        Last updated: {new Date(snapshot.generated_at).toLocaleString()}
      </p>
      <div className="flex flex-col gap-3">
        {Object.entries(snapshot.sports).map(([sport, data]) => (
          <SportSection
            key={sport}
            sport={sport}
            data={data}
            vipFilterMode={vipFilterMode}
            activeProfileRules={activeProfileRules}
          />
        ))}
      </div>
    </>
  )
}

export default SnapshotOverview
