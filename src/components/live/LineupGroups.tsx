import { cn } from '@/lib/utils'
import { formatPoints } from '../../lib/format'
import type { LiveLineupPlayer } from '../../lib/liveModel'
import { groupLineup, visibleValue } from '../../lib/livePresentation'
import { formatOwnership } from '../../lib/playerPool'
import { GameStatusDot, ValueIconMark, ValuePill } from './atoms'

function PlayerCard({ player }: { player: LiveLineupPlayer }) {
  const final = player.gameStatus === 'final'
  return (
    <li className={cn('rounded-lg border bg-card p-3', final && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] text-muted-foreground">{player.slot}</div>
          <div className="flex min-w-0 items-center gap-1 font-medium">
            <span className="truncate">{player.name}</span>
            <ValueIconMark icon={player.valueIcon} className="text-sm" />
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold tabular-nums">{formatPoints(player.points)}</div>
          {player.projection !== null && !final ? (
            <div className="font-mono text-[10px] text-muted-foreground">{`proj ${formatPoints(player.projection)}`}</div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <span>{player.clock}</span>
        <span className="flex items-center gap-2">
          {player.ownershipPct === null ? null : <span>{`${formatOwnership(player.ownershipPct)} own`}</span>}
          <ValuePill value={visibleValue(player)} />
        </span>
      </div>
      {player.stats ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{player.stats}</div> : null}
      {player.matchup ? <div className="mt-1 text-[11px] text-muted-foreground">{player.matchup}</div> : null}
    </li>
  )
}

/** A lineup as Playing now / Yet to play / Done groups of player cards; finished players are dimmed. */
function LineupGroups({ players }: { players: LiveLineupPlayer[] }) {
  return (
    <div className="mt-6 space-y-6">
      {groupLineup(players).map((group) => {
        const headingId = `lineup-group-${group.gameStatus}`
        return (
          <section key={group.gameStatus} aria-labelledby={headingId}>
            <h3
              id={headingId}
              className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              <GameStatusDot status={group.gameStatus} />
              {`${group.label} · ${group.players.length}`}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {group.players.map((player) => (
                <PlayerCard key={player.key} player={player} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export default LineupGroups
