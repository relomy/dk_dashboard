/* eslint-disable react-refresh/only-export-components */
/** PROTOTYPE (issue #81): throwaway, not for main. Badge, banner, Shifts page (three layouts) and the switcher. */
import { Fragment, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Bell, ChevronLeft, ChevronRight, Eye, Flag, Lock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { VipAvatar, GameStatusDot } from '../../components/live/atoms'
import { formatPoints } from '../../lib/format'
import { delta, gapSummaryLine, lineMoveText, oneLine, PATH_LABEL, signed } from './describe'
import {
  SCENARIOS,
  SCENARIO_KEYS,
  vipFor,
  type CashCrossingItem,
  type FinalStandingItem,
  type FeedItem,
  type FromTo,
  type GameState,
  type PlayerDiff,
  type ShiftsOutput,
  type VipMoveItem,
} from './sampleOutputs'
import { useShiftsProto } from './ShiftsProtoContext'

/* ---------- small pieces ---------- */

/** Rank is better when it falls; points and distance are better when they rise. */
function tone(change: number | null, lowerIsBetter: boolean): string {
  if (change === null || change === 0) return 'text-muted-foreground'
  return (lowerIsBetter ? change < 0 : change > 0) ? 'text-cashing' : 'text-non-cashing'
}

function Move({
  label,
  pair,
  format,
  lowerIsBetter = false,
  places = false,
  neutral = false,
}: {
  label: string
  pair: FromTo | null
  format: (value: number | null) => string
  lowerIsBetter?: boolean
  /** Show the magnitude as a count of places rather than a signed point figure. */
  places?: boolean
  /** No good or bad reading: a cash line move is neither. */
  neutral?: boolean
}) {
  if (!pair) return null
  const change = delta(pair)
  return (
    <div role="group" aria-label={label} className="min-w-0">
      <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className="font-mono text-sm tabular-nums">
        {format(pair.from)} <span className="text-muted-foreground">→</span> {format(pair.to)}
      </div>
      {change === null || change === 0 ? null : (
        <div className={cn('flex items-center gap-0.5 font-mono text-xs tabular-nums', neutral ? 'text-cash-line' : tone(change, lowerIsBetter))}>
          {(neutral ? change > 0 : lowerIsBetter ? change < 0 : change > 0) ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
          {places ? `${Math.abs(change)} places` : signed(change)}
        </div>
      )}
    </div>
  )
}

const rankText = (value: number | null) => (value === null ? '—' : `#${value}`)

function VipChip({ output, vipKey }: { output: ShiftsOutput; vipKey: string }) {
  const vip = vipFor(output, vipKey)
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <VipAvatar name={vip.name} index={vip.index} className="size-5 rounded-full text-[8px]" />
      <span className="truncate font-semibold">{vip.name}</span>
    </span>
  )
}

function PriorityMark({ item }: { item: FeedItem }) {
  if (item.priority !== 'high') return null
  return (
    <span className="rounded-sm bg-non-cashing/15 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-non-cashing uppercase">
      High
    </span>
  )
}

const GAME_WORD: Record<GameState, string> = { 'pre-game': 'Pre', 'in-progress': 'Live', final: 'Final' }

function GameChange({ game }: { game: PlayerDiff['game'] }) {
  if (!game.to) return null
  if (game.from === game.to) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <GameStatusDot status={game.to} /> {GAME_WORD[game.to]}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-foreground">
      {game.from ? <GameStatusDot status={game.from} /> : null}
      {game.from ? GAME_WORD[game.from] : null} →<GameStatusDot status={game.to} /> {GAME_WORD[game.to]}
    </span>
  )
}

/** The VIP's whole lineup, before and now: changed players first, unchanged dimmed, hidden slots last. */
function LineupDiff({ rows }: { rows: PlayerDiff[] }) {
  const changed = rows.filter((row) => row.pointsDelta !== 0 || row.game.from !== row.game.to || row.locked.from !== row.locked.to)
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[10px] tracking-widest text-muted-foreground uppercase">
        <span>Lineup</span>
        <span>
          {changed.length} of {rows.length} changed
        </span>
      </div>
      <ul className="divide-y rounded-md border">
        {rows.map((row) => {
          const hidden = row.locked.to
          const same = !changed.includes(row)
          return (
            <li key={row.playerKey} className={cn('flex items-center gap-2 px-2.5 py-1.5 text-xs', same && 'opacity-50')}>
              <span className="w-9 shrink-0 font-mono text-[10px] text-muted-foreground">{row.slot}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5">
                  {hidden ? <Lock className="size-3 text-muted-foreground" aria-label="Still locked" /> : null}
                  <span className={cn('truncate', hidden && 'text-muted-foreground')}>{hidden ? 'Still hidden' : row.name}</span>
                  {row.locked.from && !row.locked.to ? (
                    <span className="rounded-sm bg-cash-line/15 px-1 text-[10px] font-semibold text-cash-line uppercase">Revealed</span>
                  ) : null}
                  {hidden ? null : <GameChange game={row.game} />}
                </span>
                {row.stats ? <span className="block truncate text-[11px] text-muted-foreground">{row.stats}</span> : null}
              </span>
              <span className="hidden font-mono text-[11px] text-muted-foreground tabular-nums sm:block">
                {hidden ? '' : `${row.points.from === null ? '—' : formatPoints(row.points.from)} → ${formatPoints(row.points.to)}`}
              </span>
              <span
                className={cn(
                  'w-14 text-right font-mono tabular-nums',
                  row.pointsDelta === null || row.pointsDelta === 0 ? 'text-muted-foreground' : tone(row.pointsDelta, false),
                )}
              >
                {row.pointsDelta === null ? '—' : row.pointsDelta === 0 ? '0.00' : signed(row.pointsDelta)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CrossingBody({ item }: { item: CashCrossingItem }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-2">
        <Flag className={cn('size-4', item.cashing ? 'text-cashing' : 'text-non-cashing')} />
        <span className="font-medium">{PATH_LABEL[item.path]}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">now {rankText(item.rank.to)}</span>
      </div>
      {item.cause ? (
        <p className="text-xs text-muted-foreground">
          Cause: the cash line moved <span className="text-cash-line">{lineMoveText(item.cause)}</span>. Their lineup did not
          cause this.
        </p>
      ) : item.path === 'in-then-out' || item.path === 'out-then-in' ? (
        <p className="text-xs text-muted-foreground">Crossed and crossed back before you looked; a net comparison would hide it.</p>
      ) : null}
    </div>
  )
}

function MoveBody({ item }: { item: VipMoveItem }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3">
        <Move label="Rank" pair={item.rank} format={rankText} lowerIsBetter places />
        <Move label="Points" pair={item.points} format={formatPoints} />
        <Move label="To cash" pair={item.distancePoints} format={formatPoints} lowerIsBetter />
      </div>
      {item.lineup.length > 0 ? <LineupDiff rows={item.lineup} /> : null}
    </div>
  )
}

/* ---------- the three presentation pieces ---------- */

/** Decision 5: a passive unseen-count badge on the Shifts entry point. */
export function ShiftsBadge({ sport }: { sport: string }) {
  const { output } = useShiftsProto()
  const hasHigh = output.feed.some((item) => item.priority === 'high')
  return (
    <Link
      to={`/shifts/${sport}`}
      aria-label={`Shifts, ${output.unseenCount} unseen`}
      className="relative inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
    >
      <Bell className="size-4" />
      <span className="hidden sm:inline">Shifts</span>
      {output.unseenCount > 0 ? (
        <span
          className={cn(
            'grid min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] font-bold text-white',
            hasHigh ? 'bg-non-cashing' : 'bg-muted-foreground/60',
          )}
        >
          {output.unseenCount}
        </span>
      ) : null}
    </Link>
  )
}

/** High items not yet surfaced, each shown once, plus the single "while you were away" line after a long gap. */
export function ShiftsBanner({ sport }: { sport: string }) {
  const { output, profile, surfaceMode, markSurfaced } = useShiftsProto()
  // The banner captures what was unsurfaced when it mounted, so surfacing on render doesn't blank it mid-read.
  const [shown, setShown] = useState<FeedItem[]>(() => output.unsurfacedHigh)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [gapDismissed, setGapDismissed] = useState(false)

  useEffect(() => {
    setShown(output.unsurfacedHigh)
    setDismissed([])
    setGapDismissed(false)
    // Re-capture only when the scenario or Profile changes, not as items get surfaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output.label, profile])

  useEffect(() => {
    if (surfaceMode === 'render') markSurfaced(shown.map((item) => item.id))
  }, [shown, surfaceMode, markSurfaced])

  const visible = shown.filter((item) => !dismissed.includes(item.id))
  const gap = output.returnedAfterGap && !gapDismissed ? output.returnedAfterGap : null
  if (visible.length === 0 && !gap) return null

  return (
    <div role="region" aria-label="Shifts" className="space-y-px border-b bg-card">
      {gap ? (
        <div className="flex items-start gap-2 px-4 py-2 text-xs">
          <Eye className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1">{gapSummaryLine(gap, output)}</p>
          <Link to={`/shifts/${sport}`} className="shrink-0 underline underline-offset-2">
            Open
          </Link>
          <button type="button" aria-label="Dismiss summary" onClick={() => setGapDismissed(true)}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      {visible.map((item) => (
        <div key={item.id} className="flex items-start gap-2 border-l-2 border-non-cashing px-4 py-2 text-xs">
          <PriorityMark item={item} />
          <p className="min-w-0 flex-1">{oneLine(item, output)}</p>
          <Link to={`/shifts/${sport}`} className="shrink-0 underline underline-offset-2">
            View
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setDismissed((prev) => [...prev, item.id])
              if (surfaceMode === 'dismiss') markSurfaced([item.id])
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ---------- Shifts page layouts ---------- */

type Variant = 'A' | 'B' | 'C' | 'D'
const DEFAULT_VARIANT: Variant = 'D'
export const VARIANTS: { key: Variant; name: string }[] = [
  { key: 'A', name: 'Flat feed' },
  { key: 'B', name: 'Grouped per VIP' },
  { key: 'C', name: 'VIP table' },
  { key: 'D', name: 'One card per VIP, recommended' },
]

function ItemCard({ item, output, showVip = true }: { item: FeedItem; output: ShiftsOutput; showVip?: boolean }) {
  const vipKey = 'vipKey' in item ? item.vipKey : null
  return (
    <article
      className={cn('space-y-2 rounded-lg border bg-card p-3', item.priority === 'high' && 'border-non-cashing/50')}
      data-kind={item.kind}
    >
      <header className="flex items-center gap-2 text-sm">
        <PriorityMark item={item} />
        {vipKey && showVip ? <VipChip output={output} vipKey={vipKey} /> : null}
        {!vipKey ? <span className="font-semibold">{item.kind === 'contest-state' ? 'Contest' : 'Cash line'}</span> : null}
        {item.priority === 'high' && item.surfaced ? (
          <span className="text-[10px] text-muted-foreground">shown in banner</span>
        ) : null}
      </header>
      {item.kind === 'cash-crossing' ? (
        <>
          <CrossingBody item={item} />
          <div className="grid grid-cols-3 gap-3">
            <Move label="Rank" pair={item.rank} format={rankText} lowerIsBetter places />
            <Move label="Points" pair={item.points} format={formatPoints} />
          </div>
          <LineupDiff rows={item.lineup} />
        </>
      ) : null}
      {item.kind === 'vip-move' ? <MoveBody item={item} /> : null}
      {item.kind === 'cash-line-move' ? (
        <div className="grid grid-cols-2 gap-3">
          <Move label="Cash line" pair={item.change.points} format={formatPoints} neutral />
          <Move label="Cash rank" pair={item.change.rank} format={rankText} neutral places />
        </div>
      ) : null}
      {item.kind === 'contest-state' ? (
        <p className="text-sm">
          {item.from} → <span className="font-semibold">{item.to}</span>. Final standings are in; only they are compared from here.
        </p>
      ) : null}
      {item.kind === 'final-standing' ? (
        <div className="grid grid-cols-3 gap-3">
          <Move label="Rank" pair={item.rank} format={rankText} lowerIsBetter places />
          <Move label="Points" pair={item.points} format={formatPoints} />
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Finished</div>
            <div className={cn('text-sm font-medium', item.cashing ? 'text-cashing' : 'text-non-cashing')}>
              {item.cashing ? 'Cashing' : 'Not cashing'}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}

/** A: the feed exactly as #80 orders it. */
function FlatFeed({ output }: { output: ShiftsOutput }) {
  return (
    <div className="space-y-2">
      {output.feed.map((item) => (
        <ItemCard key={item.id} item={item} output={output} />
      ))}
    </div>
  )
}

/** B: contest-level items first, then one section per VIP holding that VIP's items. */
function GroupedFeed({ output }: { output: ShiftsOutput }) {
  const contest = output.feed.filter((item) => !('vipKey' in item))
  const groups = output.vips
    .map((vip) => ({ vip, items: output.feed.filter((item) => 'vipKey' in item && item.vipKey === vip.key) }))
    .filter((group) => group.items.length > 0)
  return (
    <div className="space-y-5">
      {contest.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Contest</h2>
          {contest.map((item) => (
            <ItemCard key={item.id} item={item} output={output} />
          ))}
        </section>
      ) : null}
      {groups.map(({ vip, items }) => (
        <section key={vip.key} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm">
            <VipChip output={output} vipKey={vip.key} />
            <span className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? 'shift' : 'shifts'}
            </span>
          </h2>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} output={output} showVip={false} />
          ))}
        </section>
      ))}
    </div>
  )
}

/** C: one dense row per VIP with the three net moves in columns; open a row for the players behind it. */
function TableFeed({ output }: { output: ShiftsOutput }) {
  const [open, setOpen] = useState<string | null>(null)
  const contest = output.feed.filter((item) => !('vipKey' in item))
  const rows = output.vips
    .map((vip) => {
      const items = output.feed.filter((item): item is Exclude<FeedItem, { kind: 'cash-line-move' | 'contest-state' }> =>
        'vipKey' in item && item.vipKey === vip.key,
      )
      const crossing = items.find((item): item is CashCrossingItem => item.kind === 'cash-crossing') ?? null
      const move = items.find((item): item is VipMoveItem => item.kind === 'vip-move') ?? null
      const final = items.find((item) => item.kind === 'final-standing') ?? null
      return { vip, crossing, move, final }
    })
    .filter((row) => row.crossing || row.move || row.final)
  return (
    <div className="space-y-3">
      {contest.length > 0 ? (
        <ul className="space-y-1.5">
          {contest.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs',
                item.priority === 'high' && 'border-non-cashing/50',
              )}
            >
              <PriorityMark item={item} />
              {oneLine(item, output)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-[10px] tracking-widest text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2">VIP</th>
              <th className="px-3 py-2">Cash</th>
              <th className="px-3 py-2 text-right">Rank</th>
              <th className="px-3 py-2 text-right">Points</th>
              <th className="px-3 py-2 text-right">To cash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ vip, crossing, move, final }) => {
              const rank = move?.rank ?? crossing?.rank ?? final?.rank ?? null
              const points = move?.points ?? crossing?.points ?? final?.points ?? null
              const isOpen = open === vip.key
              return (
                <Fragment key={vip.key}>
                  <tr
                    className={cn('border-t', (move || crossing) && 'cursor-pointer hover:bg-muted/40')}
                    onClick={() => (move || crossing) && setOpen(isOpen ? null : vip.key)}
                  >
                    <td className="px-3 py-2">
                      <VipChip output={output} vipKey={vip.key} />
                    </td>
                    <td className="px-3 py-2">
                      {crossing ? (
                        <span className="flex items-center gap-1 font-semibold text-non-cashing">
                          <PriorityMark item={crossing} />
                          {PATH_LABEL[crossing.path]}
                        </span>
                      ) : final ? (
                        <span className={final.cashing ? 'text-cashing' : 'text-non-cashing'}>{final.cashing ? 'Cashing' : 'Out'}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-mono', tone(rank ? delta(rank) : null, true))}>
                      {rank ? `${rankText(rank.from)} → ${rankText(rank.to)}` : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-mono', tone(points ? delta(points) : null, false))}>
                      {points ? signed(delta(points) ?? 0) : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-mono', tone(move?.distancePoints ? delta(move.distancePoints) : null, true))}>
                      {move?.distancePoints ? signed(delta(move.distancePoints) ?? 0) : '—'}
                    </td>
                  </tr>
                  {isOpen && (move || crossing) ? (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={5} className="space-y-2 px-3 py-2">
                        {crossing?.cause ? (
                          <p className="text-muted-foreground">
                            Cause: the cash line moved <span className="text-cash-line">{lineMoveText(crossing.cause)}</span>.
                          </p>
                        ) : null}
                        <LineupDiff rows={(move ?? crossing)!.lineup} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** D: one card per VIP merging their crossing and move, importance order, name dropped for a one-VIP Profile. */
function MergedFeed({ output }: { output: ShiftsOutput }) {
  const single = output.vips.length === 1
  // Cards take the position of their first item, and the feed is already High first.
  const order: string[] = []
  for (const item of output.feed) {
    const id = 'vipKey' in item ? item.vipKey : item.id
    if (!order.includes(id)) order.push(id)
  }
  return (
    <div className="space-y-2">
      {order.map((id) => {
        const items = output.feed.filter((item) => ('vipKey' in item ? item.vipKey : item.id) === id)
        const solo = items.length === 1 ? items[0] : null
        if (solo && !('vipKey' in solo)) return <ItemCard key={id} item={solo} output={output} />
        return <VipCard key={id} output={output} vipKey={id} items={items} showName={!single} />
      })}
    </div>
  )
}

function VipCard({
  output,
  vipKey,
  items,
  showName,
}: {
  output: ShiftsOutput
  vipKey: string
  items: FeedItem[]
  showName: boolean
}) {
  const [open, setOpen] = useState(false)
  const crossing = items.find((item): item is CashCrossingItem => item.kind === 'cash-crossing')
  const move = items.find((item): item is VipMoveItem => item.kind === 'vip-move')
  const final = items.find((item): item is FinalStandingItem => item.kind === 'final-standing')
  const rank = move?.rank ?? crossing?.rank ?? final?.rank ?? null
  const points = move?.points ?? crossing?.points ?? final?.points ?? null
  const lineup = (move ?? crossing)?.lineup ?? []
  const changed = lineup.filter((row) => row.pointsDelta !== 0 || row.game.from !== row.game.to || row.locked.from !== row.locked.to)
  const high = items.some((item) => item.priority === 'high')
  return (
    <article className={cn('space-y-2 rounded-lg border bg-card p-3', high && 'border-non-cashing/50')}>
      <header className="flex items-center gap-2 text-sm">
        {crossing ? <PriorityMark item={crossing} /> : null}
        {showName ? <VipChip output={output} vipKey={vipKey} /> : null}
        {crossing ? (
          <span className={cn('flex items-center gap-1.5 font-medium', !showName && 'text-base')}>
            <Flag className={cn('size-4', crossing.cashing ? 'text-cashing' : 'text-non-cashing')} />
            {showName ? PATH_LABEL[crossing.path] : PATH_LABEL[crossing.path].replace(/^./, (c) => c.toUpperCase())}
          </span>
        ) : null}
        {final ? (
          <span className={cn('font-medium', final.cashing ? 'text-cashing' : 'text-non-cashing')}>
            Finished {final.cashing ? 'cashing' : 'outside the cash line'}
          </span>
        ) : null}
      </header>
      {crossing?.cause ? (
        <p className="text-xs text-muted-foreground">
          Cause: the cash line moved <span className="text-cash-line">{lineMoveText(crossing.cause)}</span>. Their lineup did
          not cause this.
        </p>
      ) : crossing && (crossing.path === 'in-then-out' || crossing.path === 'out-then-in') ? (
        <p className="text-xs text-muted-foreground">Crossed and crossed back before you looked; a net comparison would hide it.</p>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <Move label="Rank" pair={rank} format={rankText} lowerIsBetter places />
        <Move label="Points" pair={points} format={formatPoints} />
        <Move label="To cash" pair={move?.distancePoints ?? null} format={formatPoints} lowerIsBetter />
      </div>
      {lineup.length > 0 ? (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
            Lineup · {changed.length} of {lineup.length} changed
          </button>
          {open ? (
            <div className="mt-2">
              <LineupDiff rows={lineup} />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function ShiftsPage() {
  const { output, markSeen } = useShiftsProto()
  const [params] = useSearchParams()
  const variant = (params.get('variant') ?? DEFAULT_VARIANT) as Variant
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-28">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Shifts</h1>
          <p className="truncate text-xs text-muted-foreground">
            {output.contest.name} · {output.unseenCount} unseen
          </p>
        </div>
        <Button className="ml-auto" size="sm" variant="secondary" disabled={output.unseenCount === 0} onClick={markSeen}>
          <Eye /> Mark as seen
        </Button>
      </header>
      {output.feed.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {output.gapBand === 'under-10'
            ? 'Nothing unseen: you were away for under 10 minutes, so the Seen mark moved on by itself.'
            : 'Nothing has moved for your VIPs since you last looked.'}
        </div>
      ) : variant === 'D' ? (
        <MergedFeed output={output} />
      ) : variant === 'B' ? (
        <GroupedFeed output={output} />
      ) : variant === 'C' ? (
        <TableFeed output={output} />
      ) : (
        <FlatFeed output={output} />
      )}
    </div>
  )
}

/* ---------- the switcher ---------- */

/** Floating bar: variant arrows (as the prototype skill asks), plus a scenario picker and session controls. */
export function PrototypeBar({ onShiftsPage }: { onShiftsPage: boolean }) {
  const { scenario, setScenario, profile, setProfile, surfaceMode, setSurfaceMode, reload, visits, output } = useShiftsProto()
  const [params, setParams] = useSearchParams()
  const current = (params.get('variant') ?? DEFAULT_VARIANT) as Variant
  const index = Math.max(0, VARIANTS.findIndex((variant) => variant.key === current))

  const goto = (offset: number) => {
    const next = VARIANTS[(index + offset + VARIANTS.length) % VARIANTS.length]
    setParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev)
        nextParams.set('variant', next.key)
        return nextParams
      },
      { replace: true },
    )
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select') || target.isContentEditable)) return
      if (event.key === 'ArrowLeft') goto(-1)
      if (event.key === 'ArrowRight') goto(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      role="toolbar"
      aria-label="Prototype controls"
      className="fixed bottom-3 left-1/2 z-50 flex w-[calc(100vw-1.5rem)] max-w-3xl -translate-x-1/2 flex-col gap-2 rounded-2xl border border-amber-400/60 bg-black/90 p-2 text-xs text-white shadow-xl backdrop-blur"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-amber-400 px-1.5 py-0.5 font-bold text-black uppercase">Prototype #81</span>
        <select
          aria-label="Sample output"
          className="min-w-0 flex-1 rounded border border-white/20 bg-black px-1.5 py-1"
          value={scenario}
          onChange={(event) => setScenario(event.target.value as typeof scenario)}
        >
          {SCENARIO_KEYS.map((key) => (
            <option key={key} value={key}>
              {SCENARIOS[key].label}
            </option>
          ))}
        </select>
        {onShiftsPage ? (
          <span className="flex items-center gap-1">
            <button type="button" aria-label="Previous variant" onClick={() => goto(-1)} className="rounded p-1 hover:bg-white/10">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-28 text-center font-semibold">
              {VARIANTS[index].key} ({VARIANTS[index].name})
            </span>
            <button type="button" aria-label="Next variant" onClick={() => goto(1)} className="rounded p-1 hover:bg-white/10">
              <ChevronRight className="size-4" />
            </button>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-white/80">
        <label className="flex items-center gap-1">
          Profile
          <select
            aria-label="Profile"
            className="rounded border border-white/20 bg-black px-1 py-0.5"
            value={profile}
            onChange={(event) => setProfile(event.target.value as typeof profile)}
          >
            <option value="me">Me (1 VIP)</option>
            <option value="everyone">Everyone (4 VIPs)</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Surfaced on
          <select
            aria-label="Surface mode"
            className="rounded border border-white/20 bg-black px-1 py-0.5"
            value={surfaceMode}
            onChange={(event) => setSurfaceMode(event.target.value as typeof surfaceMode)}
          >
            <option value="render">render</option>
            <option value="dismiss">explicit call (dismiss)</option>
          </select>
        </label>
        <button type="button" className="underline underline-offset-2" onClick={reload}>
          Simulate reload
        </button>
        <span className="min-w-0 truncate">Visit signals: {visits[0] ?? '—'}</span>
      </div>
      <p className="text-[11px] leading-snug text-white/60">{output.note}</p>
    </div>
  )
}
