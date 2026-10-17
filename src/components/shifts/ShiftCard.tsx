import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { DASH, formatPoints, formatRank, formatSigned } from '../../lib/format'
import type { GameStatus } from '../../lib/liveModel'
import type {
  CashLineShiftItem,
  ContestShiftItem,
  LineupSlotDiff,
  Move,
  VipShiftItem,
} from '../../lib/shifts'
import type { ReactNode } from 'react'
import { contestStateText, lineMoveText, PATH_TEXT } from './shiftText'

/**
 * One figure as `from → to` with an arrow for the direction it moved. Rank is better when it falls; points and the
 * signed distance to cash (above the cash line is positive) are better when they rise. A zero or unknown move
 * shows no arrow.
 */
export function MoveRow({
  label,
  move,
  format,
  lowerIsBetter = false,
  places = false,
  neutral = false,
}: {
  label: string
  move: Move<number | null>
  format: (value: number | null) => string
  lowerIsBetter?: boolean
  places?: boolean
  /** No good or bad reading: the arrow shows the direction only. */
  neutral?: boolean
}) {
  const { from, to } = move
  const change = from === null || to === null ? 0 : to - from
  const improved = lowerIsBetter ? change < 0 : change > 0
  // The arrow points up for an improvement (a rank that falls climbs the board); a neutral figure follows its value.
  const up = neutral ? change > 0 : improved
  const Arrow = up ? ArrowUp : ArrowDown
  return (
    <div role="group" aria-label={label} className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('flex items-center gap-1 font-mono tabular-nums', change !== 0 && !neutral && (improved ? 'text-cashing' : 'text-non-cashing'))}>
        {format(from)} → {format(to)}
        {places && change !== 0 ? <span className="text-xs">({Math.abs(change)} places)</span> : null}
        {change !== 0 ? (
          <Arrow role="img" data-direction={up ? 'up' : 'down'} aria-label={neutral ? (change > 0 ? 'Up' : 'Down') : improved ? 'Improved' : 'Worsened'} className="size-3" />
        ) : null}
      </span>
    </div>
  )
}

/**
 * Whether a slot's player moved: own points, locked state, or game status. A player with no earlier game status
 * (a late swap) is not compared, and a `stats` change alone does not count.
 */
function isChanged(slot: LineupSlotDiff): boolean {
  return (
    (slot.pointsMove ?? 0) !== 0 ||
    slot.locked.from !== slot.locked.to ||
    (slot.gameStatus.from !== null && slot.gameStatus.from !== slot.gameStatus.to)
  )
}

const GAME_WORD: Record<GameStatus, string> = { 'pre-game': 'Pre', 'in-progress': 'Live', final: 'Final' }

/** A player's game status: both statuses when it changed (`Live → Final`), one when it held. */
function gameStatusText(status: Move<GameStatus | null>): string | null {
  if (status.to === null) return null
  if (status.from !== null && status.from !== status.to) return `${GAME_WORD[status.from]} → ${GAME_WORD[status.to]}`
  return GAME_WORD[status.to]
}

/** A player's own points move: a signed figure, `0.00` when it held, a dash when it cannot be compared. */
function deltaText(move: number | null): string {
  if (move === null) return DASH
  return move === 0 ? formatPoints(0) : formatSigned(move)
}

/** Rising points are good, falling are bad, as for the VIP's own points; a held or unknown move reads neutral. */
function deltaTone(move: number | null): string {
  if (move === null || move === 0) return 'text-muted-foreground'
  return move > 0 ? 'text-cashing' : 'text-non-cashing'
}

/** The VIP's whole lineup diff behind a collapsed row. Rows keep the order the feed gives them. */
export function LineupDiff({ lineup }: { lineup: LineupSlotDiff[] }) {
  const [open, setOpen] = useState(false)
  const changed = lineup.filter(isChanged).length
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="pt-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="w-full justify-start text-muted-foreground"
      >
        <Chevron aria-hidden />
        Lineup · {changed} of {lineup.length} changed
      </Button>
      {open ? (
        <ul className="mt-1 divide-y divide-border">
          {lineup.map((slot) => {
            const hidden = slot.locked.to
            return (
              <li key={slot.key} className={cn('flex items-center gap-2 py-1.5', !isChanged(slot) && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    {hidden ? <Lock role="img" aria-label="Still locked" className="size-3 text-muted-foreground" /> : null}
                    <span className={cn('truncate', hidden && 'text-muted-foreground')}>{hidden ? 'Still hidden' : slot.name}</span>
                    {slot.locked.from && !slot.locked.to ? (
                      <Badge variant="outline" className="border-cash-line text-cash-line">
                        Revealed
                      </Badge>
                    ) : null}
                    {hidden ? null : <span className="text-xs text-muted-foreground">{gameStatusText(slot.gameStatus)}</span>}
                  </div>
                  {slot.stats?.to ? <p className="truncate text-[11px] text-muted-foreground">{slot.stats.to}</p> : null}
                </div>
                {hidden ? null : (
                  <span className="hidden font-mono text-xs text-muted-foreground tabular-nums sm:block">
                    {slot.points.from === null ? DASH : formatPoints(slot.points.from)} → {formatPoints(slot.points.to)}
                  </span>
                )}
                {hidden ? null : (
                  <span className={cn('w-14 shrink-0 text-right font-mono text-xs tabular-nums', deltaTone(slot.pointsMove))}>
                    {deltaText(slot.pointsMove)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function ShiftCardFrame({ title, high, children }: { title: string; high: boolean; children: ReactNode }) {
  return (
    <article>
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2">
              {title}
              {high ? <Badge variant="destructive">High</Badge> : null}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">{children}</CardContent>
      </Card>
    </article>
  )
}

export function VipShiftCard({ item, name }: { item: VipShiftItem; name: string }) {
  return (
    <ShiftCardFrame title={name} high={item.priority === 'high'}>
      {item.finishedCashing === undefined ? null : (
        <p>{item.finishedCashing ? 'Finished cashing' : 'Finished outside the cash line'}</p>
      )}
      {item.crossing ? (
        <>
          <p>{PATH_TEXT[item.crossing.path]}</p>
          {item.crossing.cause && lineMoveText(item.crossing.cause) ? (
            <p className="text-muted-foreground">
              The cash line moved {lineMoveText(item.crossing.cause)}. Their lineup did not cause this.
            </p>
          ) : null}
        </>
      ) : null}
      <MoveRow label="Rank" move={item.rank} format={formatRank} lowerIsBetter places />
      <MoveRow label="Points" move={item.points} format={formatPoints} />
      {item.finishedCashing === undefined ? (
        <MoveRow label="To cash" move={item.distanceToCashPoints} format={formatSigned} />
      ) : null}
      {item.lineup && item.lineup.length > 0 ? <LineupDiff lineup={item.lineup} /> : null}
    </ShiftCardFrame>
  )
}

/** A rising cash line is not an improvement for anyone, so its arrows carry no good or bad reading. */
export function CashLineShiftCard({ item }: { item: CashLineShiftItem }) {
  return (
    <ShiftCardFrame title="Cash line" high={item.priority === 'high'}>
      <MoveRow label="Points" move={item.points} format={formatPoints} neutral />
      <MoveRow label="Rank" move={item.rank} format={formatRank} neutral />
    </ShiftCardFrame>
  )
}

export function ContestShiftCard({ item }: { item: ContestShiftItem }) {
  return (
    <ShiftCardFrame title="Contest" high={item.priority === 'high'}>
      <p>{contestStateText(item.state.to)}.</p>
    </ShiftCardFrame>
  )
}
