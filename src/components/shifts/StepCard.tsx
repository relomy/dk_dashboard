import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatPoints, formatRank, formatSigned } from '../../lib/format'
import type { LiveModel } from '../../lib/liveModel'
import type { CashLineShiftItem, ContestShiftItem, FinalStanding, TimelineStep } from '../../lib/shifts'
import { ALL_KINDS, type FilteredItem } from '../../lib/timelineFilter'
import { compactVipLine } from './compactText'
import { LineupDiff, MoveRow } from './ShiftCard'
import { contestStateText, describeItem, finalStandingText, lineMoveText, PATH_TEXT, vipName } from './shiftText'
import { clockOf } from './timelineText'

/** The contest's final standings, the Profile's VIPs first. Contest-level: the VIP filter never hides them. */
function orderedStandings(item: ContestShiftItem, followed: ReadonlySet<string>): FinalStanding[] {
  const standings = item.standings ?? []
  return [
    ...standings.filter((standing) => followed.has(standing.vipKey)),
    ...standings.filter((standing) => !followed.has(standing.vipKey)),
  ]
}

/** The "+N hidden" chip: reveals the parts of a row the filters hid. */
function HiddenToggle({ count, revealed, onToggle }: { count: number; revealed: boolean; onToggle: () => void }) {
  if (count === 0) return null
  return (
    <Button type="button" variant="outline" size="xs" aria-expanded={revealed} onClick={onToggle}>
      +{count} hidden
    </Button>
  )
}

/** The parts of a row to show: what the filters pass, plus what the user revealed, in kind order. */
function useRowParts({ shown, hidden }: FilteredItem) {
  const [revealed, setRevealed] = useState(false)
  const parts = revealed ? ALL_KINDS.filter((kind) => shown.includes(kind) || hidden.includes(kind)) : shown
  return {
    parts,
    toggleChip: (
      <HiddenToggle count={hidden.length} revealed={revealed} onToggle={() => setRevealed((value) => !value)} />
    ),
  }
}

function VipRow({ row, name, filtered }: { row: FilteredItem; name: string; filtered: boolean }) {
  const { item, shown } = row
  const { parts, toggleChip } = useRowParts(row)
  if (item.kind !== 'vip') return null
  const crossingCause = item.crossing?.cause ? lineMoveText(item.crossing.cause) : ''
  const showLineup =
    parts.includes('player-events') || (!filtered && !item.parts.includes('player-events') && shown.length > 0)
  return (
    <section aria-label={name} className="space-y-1 border-t border-border px-3 py-2 first:border-t-0">
      <h2 className="flex items-center gap-2 font-semibold">
        {name}
        {item.priority === 'high' && parts.includes('crossings') ? <Badge variant="destructive">High</Badge> : null}
      </h2>
      {parts.includes('crossings') && item.crossing ? <p>{PATH_TEXT[item.crossing.path]}</p> : null}
      {parts.includes('crossings') && crossingCause ? (
        <p className="text-muted-foreground">The cash line moved {crossingCause}. Their lineup did not cause this.</p>
      ) : null}
      {parts.includes('rank-points') ? (
        <>
          <MoveRow label="Rank" move={item.rank} format={formatRank} lowerIsBetter places />
          <MoveRow label="Points" move={item.points} format={formatPoints} />
          <MoveRow label="To cash" move={item.distanceToCashPoints} format={formatSigned} />
        </>
      ) : null}
      {showLineup && item.lineup && item.lineup.length > 0 ? <LineupDiff lineup={item.lineup} /> : null}
      {toggleChip}
    </section>
  )
}

function CashLineRow({ item }: { item: CashLineShiftItem }) {
  return <p className="bg-cash-line-muted px-3 py-2 text-cash-line">The cash line moved {lineMoveText(item)}</p>
}

function ContestRow({
  item,
  model,
  followed,
  username,
}: {
  item: ContestShiftItem
  model: LiveModel
  followed: ReadonlySet<string>
  username: string | undefined
}) {
  const standings = orderedStandings(item, followed)
  return (
    <div className="space-y-1 border-t border-border px-3 py-2 first:border-t-0">
      <p className="flex items-center gap-2 font-semibold">
        {contestStateText(item.state.to)}
        {item.priority === 'high' ? <Badge variant="destructive">High</Badge> : null}
      </p>
      {standings.length > 0 ? (
        <ul className="space-y-0.5">
          {standings.map((standing) => (
            <li key={standing.vipKey} className="flex justify-between gap-2">
              <span>{vipName(model, standing.vipKey, username)}</span>
              <span className="font-mono tabular-nums">
                {formatRank(standing.rank.to)} · {formatPoints(standing.points.to)} ·{' '}
                {standing.cashing ? 'Cashing' : 'Not cashing'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Compact: one short line per change, with the row's "+N hidden" chip after its last line. */
function CompactItem({
  row,
  model,
  followed,
  username,
}: {
  row: FilteredItem
  model: LiveModel
  followed: ReadonlySet<string>
  username: string | undefined
}) {
  const { item } = row
  const { parts, toggleChip } = useRowParts(row)
  const lines: string[] =
    item.kind === 'vip'
      ? parts.flatMap((part) => compactVipLine(item, part, vipName(model, item.vipKey, username)) ?? [])
      : [
          describeItem(item, model, username),
          ...(item.kind === 'contest-state'
            ? orderedStandings(item, followed).map((standing) =>
                finalStandingText(vipName(model, standing.vipKey, username), standing.rank.to, standing.cashing),
              )
            : []),
        ]
  return (
    <>
      {lines.map((line, index) => (
        <li key={index} className="px-3 py-1">
          {line}
        </li>
      ))}
      {row.hidden.length > 0 ? <li className="px-3 py-1">{toggleChip}</li> : null}
    </>
  )
}

export function StepCard({
  step,
  rows,
  model,
  followed,
  username,
  compact,
  filtered,
}: {
  step: TimelineStep
  rows: FilteredItem[]
  model: LiveModel
  followed: ReadonlySet<string>
  username: string | undefined
  compact: boolean
  filtered: boolean
}) {
  return (
    <article
      aria-label={`Step at ${clockOf(step.snapshotAt)}`}
      data-snapshot-at={step.snapshotAt}
      tabIndex={-1}
      className="min-w-0 outline-none"
    >
      <Card size="sm" className="gap-0 py-0">
        <header className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          <time dateTime={step.snapshotAt}>{clockOf(step.snapshotAt)}</time>
        </header>
        {compact ? (
          <ul aria-label="Changes" className="divide-y divide-border">
            {rows.map((row) => (
              <CompactItem key={row.item.id} row={row} model={model} followed={followed} username={username} />
            ))}
          </ul>
        ) : (
          rows.map((row) => {
            const { item } = row
            switch (item.kind) {
              case 'vip':
                return (
                  <VipRow key={item.id} row={row} name={vipName(model, item.vipKey, username)} filtered={filtered} />
                )
              case 'cash-line':
                return <CashLineRow key={item.id} item={item} />
              case 'contest-state':
                return <ContestRow key={item.id} item={item} model={model} followed={followed} username={username} />
            }
          })
        )}
      </Card>
    </article>
  )
}
