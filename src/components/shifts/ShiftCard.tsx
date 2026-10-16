import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPoints, formatRank, formatSigned } from '../../lib/format'
import type { CashLineMove, CashLineShiftItem, ContestShiftItem, CrossingPath, Move, VipShiftItem } from '../../lib/shifts'
import type { ReactNode } from 'react'

const PATH_TEXT: Record<CrossingPath, string> = {
  in: 'Moved into cashing',
  out: 'Fell out of cashing',
  'in then out': 'Crossed into cashing and back out',
  'out then in': 'Fell out of cashing and back in',
}

/** Words for a cash line move: its points and, when it shifted, its rank. */
function lineMoveText(move: CashLineMove): string {
  const parts: string[] = []
  const { points, rank } = move
  if (points.from !== null && points.to !== null && points.to !== points.from) {
    parts.push(`${formatSigned(points.to - points.from)} pts`)
  }
  if (rank.from !== null && rank.to !== null && rank.to !== rank.from) {
    const places = rank.to - rank.from
    parts.push(`${places > 0 ? 'down' : 'up'} ${Math.abs(places)} places`)
  }
  return parts.join(' and ')
}

/**
 * One figure as `from → to` with an arrow for the direction it moved. Rank is better when it falls; points and the
 * signed distance to cash (above the cash line is positive) are better when they rise. A zero or unknown move
 * shows no arrow.
 */
function MoveRow({
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
  const Arrow = change > 0 ? ArrowUp : ArrowDown
  return (
    <div role="group" aria-label={label} className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('flex items-center gap-1 font-mono tabular-nums', change !== 0 && !neutral && (improved ? 'text-cashing' : 'text-non-cashing'))}>
        {format(from)} → {format(to)}
        {places && change !== 0 ? <span className="text-xs">({Math.abs(change)} places)</span> : null}
        {change !== 0 ? (
          <Arrow role="img" aria-label={neutral ? (change > 0 ? 'Up' : 'Down') : improved ? 'Improved' : 'Worsened'} className="size-3" />
        ) : null}
      </span>
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
      <p>{item.state.to === 'completed' ? 'The contest is complete: the final standings are in.' : `The contest is now ${item.state.to}.`}</p>
    </ShiftCardFrame>
  )
}
