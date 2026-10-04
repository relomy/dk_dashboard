import { cn } from '@/lib/utils'
import type { LiveTotalOwnership } from '../../lib/liveModel'
import { formatOwnership } from '../../lib/playerPool'

/**
 * Total ownership of the whole pool as one stacked bar: Final · In play · Pre-game shares,
 * with the raw total beside it and the raw parts on hover. Never "locked": in DraftKings a
 * player locks when their game starts.
 */
function TotalOwnershipBar({ total }: { total: LiveTotalOwnership }) {
  const parts = [
    { label: 'Final', share: total.finalShare, raw: total.final, className: 'bg-game-final' },
    { label: 'In play', share: total.inPlayShare, raw: total.inPlay, className: 'bg-game-in-progress' },
    { label: 'Pre-game', share: total.preGameShare, raw: total.preGame, className: 'bg-game-pre-game' },
  ]
  const hasGameStatus = total.final + total.inPlay + total.preGame > 0 || total.total === 0
  const title = `Total ownership ${formatOwnership(total.total)} — ${parts
    .map((part) => `${part.label} ${formatOwnership(part.raw)}`)
    .join(' · ')}`

  return (
    <section aria-label="Total ownership" title={title} className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span className="font-semibold tracking-widest uppercase">Total ownership</span>
        <span className="font-mono tabular-nums">{formatOwnership(total.total)}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {parts.map((part) => (
          <div key={part.label} className={part.className} style={{ width: `${part.share}%` }} />
        ))}
      </div>
      {hasGameStatus ? (
        <ul aria-label="Game status shares" className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {parts.map((part) => (
            <li key={part.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-2 rounded-sm', part.className)} />
              <span>{part.label}</span> <span className="font-mono text-foreground">{Math.round(part.share)}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Game status isn't available for this sport.</p>
      )}
    </section>
  )
}

export default TotalOwnershipBar
