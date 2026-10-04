import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  formatContestState,
  formatMoney,
  getVipCashingStatus,
  normalizeContestState,
} from '../lib/contestDisplay'
import type { Contest, VipLineup } from '../lib/types'

/** One contest: name, fee, state, field facts and the VIP lineups that survived the filter. */
function ContestCard({
  contest,
  lineups,
  wholeDollars = false,
}: {
  contest: Contest
  lineups: VipLineup[]
  wholeDollars?: boolean
}) {
  const contestState = normalizeContestState(contest.state)

  return (
    <article className="card-surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <h3 className="min-w-0 flex-1 font-medium break-words">{contest.name}</h3>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatMoney(contest.entry_fee_cents, contest.currency, wholeDollars)}
        </span>
        <Badge variant="outline" className={cn(contestState === 'live' && 'text-foreground')}>
          {formatContestState(contestState)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">
        <p>Field size: {contest.max_entries}</p>
        {typeof contest.max_entries_per_user === 'number' ? (
          <p>Max per user: {contest.max_entries_per_user}</p>
        ) : null}
        <p>Prize pool: {formatMoney(contest.prize_pool_cents, contest.currency, wholeDollars)}</p>
      </div>
      <div className="px-3 pb-3">
        <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">VIP lineups</h4>
        {lineups.length === 0 ? (
          <p className="text-muted-foreground">No matching VIP lineups.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lineups.map((lineup, lineupIndex) => {
              const cashingStatus = getVipCashingStatus(contestState, lineup, contest.currency)
              const lineupKey = lineup.entry_key || lineup.vip_entry_key || lineup.display_name
              return (
                <div
                  key={lineup.entry_key || lineup.vip_entry_key || `${lineup.display_name}-${lineupIndex}`}
                  className="min-w-0 rounded-lg border bg-background/40 p-2"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{lineup.display_name}</p>
                    {cashingStatus ? (
                      <Badge
                        className={cn(
                          'font-mono',
                          cashingStatus.positive
                            ? 'bg-cashing-muted text-cashing-foreground'
                            : 'bg-non-cashing-muted text-non-cashing-foreground',
                        )}
                      >
                        {cashingStatus.label}
                      </Badge>
                    ) : null}
                  </div>
                  <ol className="flex flex-col gap-0.5 text-xs">
                    {(lineup.slots ?? []).map((slot, index) => (
                      <li key={`${lineupKey}-${index}`} className="flex gap-2">
                        <span className="w-9 shrink-0 font-mono text-muted-foreground">{slot.slot}</span>
                        <span className="min-w-0 break-words">
                          {slot.player_name}
                          {slot.multiplier ? (
                            <span className="ml-1 font-mono text-muted-foreground">x{slot.multiplier}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}

export default ContestCard
