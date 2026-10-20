import { describe, expect, it } from 'vitest'
import type {
  CashLineShiftItem,
  ContestShiftItem,
  ShiftPart,
  TimelineEntry,
  TimelineStep,
  VipShiftItem,
} from '../shifts'
import { ALL_KINDS, filterTimeline, type TimelineFilters } from '../timelineFilter'

const move = <T>(from: T, to: T) => ({ from, to })

function vip(id: string, vipKey: string, parts: ShiftPart[]): VipShiftItem {
  return {
    kind: 'vip',
    id,
    vipKey,
    priority: parts.includes('crossings') ? 'high' : 'normal',
    detectedAt: 0,
    snapshotAt: '2026-10-04T18:00:00Z',
    parts,
    rank: move(10, 8),
    points: move(100, 110),
    distanceToCashPoints: move(-5, 5),
    distanceToCashRank: move(null, null),
  }
}
const cashLine = (id: string): CashLineShiftItem => ({
  kind: 'cash-line',
  id,
  priority: 'normal',
  detectedAt: 0,
  snapshotAt: '2026-10-04T18:00:00Z',
  parts: ['cash-line'],
  points: move(1, 2),
  rank: move(1, 2),
})
const contest = (id: string): ContestShiftItem => ({
  kind: 'contest-state',
  id,
  priority: 'high',
  detectedAt: 0,
  snapshotAt: '2026-10-04T18:00:00Z',
  parts: ['contest-state'],
  state: move('live', 'completed'),
})

function step(id: string, items: TimelineStep['items']): TimelineStep {
  return { kind: 'step', id, snapshotAt: `2026-10-04T18:0${id}:00Z`, items }
}

const defaults = (overrides: Partial<TimelineFilters> = {}): TimelineFilters => ({
  vips: new Set(['a', 'b']),
  kinds: new Set(ALL_KINDS),
  highOnly: false,
  ...overrides,
})

/** Each Step's rows as `id:shown|hidden`, so a test reads the filtered rail in one glance. */
function summary(entries: ReturnType<typeof filterTimeline>): string[][] {
  return entries.map((entry) =>
    entry.kind === 'gap'
      ? ['gap']
      : entry.items.map((row) => `${row.item.id}:${row.shown.join(',')}|${row.hidden.join(',')}`),
  )
}

describe('filterTimeline', () => {
  const mixed = vip('v1', 'a', ['rank-points', 'player-events', 'crossings'])

  it('shows every part of every row under the default filters', () => {
    const out = filterTimeline([step('1', [mixed, cashLine('c1')])], defaults())
    expect(summary(out)).toEqual([['v1:rank-points,player-events,crossings|', 'c1:cash-line|']])
  })

  it('hides VIPs that are not selected but never contest-level items', () => {
    const out = filterTimeline(
      [step('1', [vip('v1', 'a', ['rank-points']), vip('v2', 'b', ['rank-points']), cashLine('c1'), contest('s1')])],
      defaults({ vips: new Set(['b']) }),
    )
    expect(summary(out)).toEqual([['v2:rank-points|', 'c1:cash-line|', 's1:contest-state|']])
  })

  it('drops a Step whose only VIP rows are filtered out', () => {
    const out = filterTimeline(
      [step('1', [vip('v1', 'a', ['rank-points'])]), step('2', [vip('v2', 'b', ['rank-points'])])],
      defaults({ vips: new Set(['b']) }),
    )
    expect(out.map((entry) => entry.kind === 'step' && entry.step.id)).toEqual(['2'])
  })

  it('moves the parts a kind filter excludes to hidden on a mixed row', () => {
    const out = filterTimeline([step('1', [mixed])], defaults({ kinds: new Set<ShiftPart>(['crossings']) }))
    expect(summary(out)).toEqual([['v1:crossings|rank-points,player-events']])
  })

  it('removes a row with no part of a selected kind, and then its Step', () => {
    const out = filterTimeline(
      [step('1', [vip('v1', 'a', ['rank-points'])]), step('2', [cashLine('c1')])],
      defaults({ kinds: new Set<ShiftPart>(['cash-line']) }),
    )
    expect(summary(out)).toEqual([['c1:cash-line|']])
  })

  it('lets the kind filter hide Contest state', () => {
    const out = filterTimeline([step('1', [contest('s1')])], defaults({ kinds: new Set<ShiftPart>(['rank-points']) }))
    expect(out).toEqual([])
  })

  it('under High priority only keeps crossings and contest state, hiding the Normal parts of a mixed row', () => {
    const out = filterTimeline(
      [step('1', [mixed, vip('v2', 'b', ['rank-points']), cashLine('c1'), contest('s1')])],
      defaults({ highOnly: true }),
    )
    expect(summary(out)).toEqual([['v1:crossings|rank-points,player-events', 's1:contest-state|']])
  })

  it('combines the kind filter with High priority only', () => {
    const out = filterTimeline(
      [step('1', [mixed])],
      defaults({ highOnly: true, kinds: new Set<ShiftPart>(['rank-points']) }),
    )
    expect(out).toEqual([])
  })

  it('keeps gaps in place', () => {
    const gap: TimelineEntry = { kind: 'gap', id: 'g', snapshotAt: '2026-10-04T18:05:00Z', reason: 'unavailable' }
    expect(summary(filterTimeline([gap, step('1', [mixed])], defaults()))).toEqual([
      ['gap'],
      ['v1:rank-points,player-events,crossings|'],
    ])
  })
})
