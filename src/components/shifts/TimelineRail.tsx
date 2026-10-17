import { Fragment, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatPoints, formatRank, formatSigned } from '../../lib/format'
import type { LiveModel } from '../../lib/liveModel'
import type { ProfileMatchRules } from '../../lib/profiles'
import type { CashLineShiftItem, ContestShiftItem, ShiftItem, Timeline, TimelineEntry, TimelineGap, TimelineStep, VipShiftItem } from '../../lib/shifts'
import { followedVipKeys } from '../../lib/followedVips'
import { LineupDiff, MoveRow } from './ShiftCard'
import { contestStateText, lineMoveText, PATH_TEXT, vipName } from './shiftText'

function clockOf(snapshotAt: string): string {
  const date = new Date(snapshotAt)
  return Number.isNaN(date.getTime()) ? snapshotAt : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function VipRow({ item, name }: { item: VipShiftItem; name: string }) {
  const crossingCause = item.crossing?.cause ? lineMoveText(item.crossing.cause) : ''
  return (
    <section aria-label={name} className="space-y-1 border-t border-border px-3 py-2 first:border-t-0">
      <h3 className="flex items-center gap-2 font-semibold">
        {name}
        {item.priority === 'high' ? <Badge variant="destructive">High</Badge> : null}
      </h3>
      {item.crossing ? <p>{PATH_TEXT[item.crossing.path]}</p> : null}
      {crossingCause ? <p className="text-muted-foreground">The cash line moved {crossingCause}. Their lineup did not cause this.</p> : null}
      <MoveRow label="Rank" move={item.rank} format={formatRank} lowerIsBetter places />
      <MoveRow label="Points" move={item.points} format={formatPoints} />
      <MoveRow label="To cash" move={item.distanceToCashPoints} format={formatSigned} />
      {item.lineup && item.lineup.length > 0 ? <LineupDiff lineup={item.lineup} /> : null}
    </section>
  )
}

function CashLineRow({ item }: { item: CashLineShiftItem }) {
  return <p className="bg-cash-line-muted px-3 py-2 text-cash-line">The cash line moved {lineMoveText(item)}</p>
}

function ContestRow({ item, model, followed, username }: { item: ContestShiftItem; model: LiveModel; followed: Set<string>; username: string | undefined }) {
  const standings = (item.standings ?? []).filter((standing) => followed.has(standing.vipKey))
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
                {formatRank(standing.rank.to)} · {formatPoints(standing.points.to)} · {standing.cashing ? 'Cashing' : 'Not cashing'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** What a Step shows for the followed VIPs: their rows, plus the contest-level items, which no VIP filter hides. */
function visibleItems(step: TimelineStep, followed: Set<string>): ShiftItem[] {
  return step.items.filter((item) => item.kind !== 'vip' || followed.has(item.vipKey))
}

function StepCard({ step, items, model, followed, username }: { step: TimelineStep; items: ShiftItem[]; model: LiveModel; followed: Set<string>; username: string | undefined }) {
  return (
    <article aria-label={`Step at ${clockOf(step.snapshotAt)}`} className="min-w-0">
      <Card size="sm" className="gap-0 py-0">
        <header className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-xs text-muted-foreground">
          <time dateTime={step.snapshotAt}>{clockOf(step.snapshotAt)}</time>
        </header>
        {items.map((item) => {
          switch (item.kind) {
            case 'vip':
              return <VipRow key={item.id} item={item} name={vipName(model, item.vipKey, username)} />
            case 'cash-line':
              return <CashLineRow key={item.id} item={item} />
            case 'contest-state':
              return <ContestRow key={item.id} item={item} model={model} followed={followed} username={username} />
          }
        })}
      </Card>
    </article>
  )
}

/** A dashed rail node where a snapshot was skipped; only a failure offers a retry. */
function GapNode({ gap, onRetry }: { gap: TimelineGap; onRetry?: (snapshotAt: string) => Promise<void> | void }) {
  const [retrying, setRetrying] = useState(false)
  const label = gap.reason === 'unavailable' ? 'Snapshot unavailable' : 'Not fresh'
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry?.(gap.snapshotAt)
    } finally {
      setRetrying(false)
    }
  }
  return (
    <div role="group" aria-label={`${label} at ${clockOf(gap.snapshotAt)}`} className="space-y-1 rounded-xl border border-dashed border-border px-3 py-2 text-muted-foreground">
      <p className="font-medium">{label}</p>
      <p className="text-xs">Shifts inside it may be lost; the Steps either side are compared across it.</p>
      {gap.reason === 'unavailable' && onRetry ? (
        <Button variant="outline" size="sm" disabled={retrying} onClick={() => void retry()}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

/** A rail row: the dot on the rail, then the node itself. */
function RailRow({ children, dashed = false }: { children: React.ReactNode; dashed?: boolean }) {
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2">
      <div className="relative" aria-hidden="true">
        <span className="absolute inset-y-0 left-[7px] border-l-2 border-border" />
        <span className={cn('absolute left-[2px] top-3.5 size-3 rounded-full border-2 border-muted-foreground bg-background', dashed && 'border-dashed')} />
      </div>
      <div className="py-1.5">{children}</div>
    </li>
  )
}

interface Row {
  entry: TimelineEntry
  items: ShiftItem[]
}

/** The Seen mark's divider: a line across the rail, labelled with the Seen mark's snapshot time. */
function SeenMark({ seenAt }: { seenAt: string }) {
  return (
    <li role="separator" aria-label={`Seen mark at ${clockOf(seenAt)}`} className="flex items-center gap-2 py-1 font-mono text-xs text-muted-foreground">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span aria-hidden="true">Seen {clockOf(seenAt)}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </li>
  )
}

/** The oldest snapshot time the rail reaches, whether a step, a gap or the range note's digest. */
function rangeFloor(timeline: Timeline): number | null {
  const times = [...timeline.entries.map((entry) => entry.snapshotAt), ...(timeline.rangeNote ? [timeline.rangeNote.snapshotAt] : [])].map((at) => Date.parse(at))
  return times.length > 0 ? Math.min(...times) : null
}

/** The step rail: one card per Step, newest first, one row per followed VIP. */
export function TimelineRail({
  timeline,
  model,
  rules,
  onRetryGap,
  seenAt,
}: {
  timeline: Timeline
  model: LiveModel
  rules: ProfileMatchRules
  /** Refetches a failed snapshot; a gap offers its retry only when this is given. */
  onRetryGap?: (snapshotAt: string) => Promise<void> | void
  /** The Seen mark's snapshot time: the divider sits above the first row at or before it, or at the tail note when the mark lies before the rail. */
  seenAt: string | null
}) {
  const followed = followedVipKeys(model, rules)
  const username = rules.username
  const rows = timeline.entries.flatMap((entry): Row[] => {
    if (entry.kind === 'gap') return [{ entry, items: [] }]
    const items = visibleItems(entry, followed)
    return items.length > 0 ? [{ entry, items }] : []
  })
  if (!rows.some((row) => row.entry.kind === 'step')) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No VIP shifts yet</p>
  }
  const seenMs = seenAt === null ? null : Date.parse(seenAt)
  const floor = rangeFloor(timeline)
  const beyondRange = seenMs !== null && floor !== null && seenMs < floor
  const firstSeen = rows.findIndex(({ entry }) => seenMs !== null && Date.parse(entry.snapshotAt) <= seenMs)
  const dividerAt = seenAt === null || beyondRange ? -1 : firstSeen === -1 ? rows.length : firstSeen
  const divider = seenAt === null ? null : <SeenMark seenAt={seenAt} />
  return (
    <div className="space-y-2">
      <ol aria-label="Timeline" className="flex flex-col">
        {rows.map(({ entry, items }, index) => (
          <Fragment key={entry.id}>
            {index === dividerAt ? divider : null}
            {entry.kind === 'gap' ? (
              <RailRow dashed>
                <GapNode gap={entry} onRetry={onRetryGap} />
              </RailRow>
            ) : (
              <RailRow>
                <StepCard step={entry} items={items} model={model} followed={followed} username={username} />
              </RailRow>
            )}
          </Fragment>
        ))}
        {dividerAt === rows.length ? divider : null}
      </ol>
      {timeline.rangeNote?.kind === 'from' ? (
        <p className="text-center text-xs text-muted-foreground">From {clockOf(timeline.rangeNote.snapshotAt)}</p>
      ) : null}
      {beyondRange ? <p className="text-center text-xs text-muted-foreground">Unseen shifts exist further back than this Timeline reaches.</p> : null}
    </div>
  )
}
