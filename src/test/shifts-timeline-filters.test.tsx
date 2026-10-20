import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TimelineFilterBar } from '../components/shifts/TimelineFilterBar'
import { TimelineRail } from '../components/shifts/TimelineRail'
import { useTimelineView } from '../hooks/useTimelineView'
import { buildLiveModel, type LiveModel } from '../lib/liveModel'
import type { ProfileMatchRules } from '../lib/profiles'
import type {
  CashLineShiftItem,
  ContestShiftItem,
  LineupSlotDiff,
  ShiftPart,
  Timeline,
  VipShiftItem,
} from '../lib/shifts'
import { load } from './liveHarness'

const result = buildLiveModel(load(), 'nfl')
if (result.kind !== 'ready') throw new Error('fixture is not renderable')
const MODEL: LiveModel = result.model
const [FIRST, SECOND] = MODEL.vips
const move = <T,>(from: T, to: T) => ({ from, to })

const slot: LineupSlotDiff = {
  key: 'slot-0',
  slot: 'QB',
  name: 'Pat Player',
  playerKey: 'p1',
  points: move(5, 9),
  pointsMove: 4,
  locked: move(false, false),
  gameStatus: move('in-progress', 'in-progress'),
}

function vip(id: string, vipKey: string, parts: ShiftPart[]): VipShiftItem {
  return {
    kind: 'vip',
    id,
    vipKey,
    priority: parts.includes('crossings') ? 'high' : 'normal',
    detectedAt: 0,
    snapshotAt: '2026-10-04T18:00:00Z',
    parts,
    rank: move(20, 12),
    points: move(100, 110),
    distanceToCashPoints: move(-5, 5),
    distanceToCashRank: move(null, null),
    lineup: [slot],
    ...(parts.includes('crossings') ? { crossing: { path: 'in' as const, cause: null } } : {}),
  }
}
const cashLine: CashLineShiftItem = {
  kind: 'cash-line',
  id: 'cash',
  priority: 'normal',
  detectedAt: 0,
  snapshotAt: '2026-10-04T18:00:00Z',
  parts: ['cash-line'],
  points: move(90, 95),
  rank: move(500, 490),
}
const completed: ContestShiftItem = {
  kind: 'contest-state',
  id: 'state',
  priority: 'high',
  detectedAt: 0,
  snapshotAt: '2026-10-04T18:00:00Z',
  parts: ['contest-state'],
  state: move('live', 'completed'),
}

/** Newest first: 18:15 a mixed row for the first VIP; 18:10 the second VIP's rank move; 18:05 the cash line; 18:00 completion. */
const TIMELINE: Timeline = {
  entries: [
    {
      kind: 'step',
      id: 's15',
      snapshotAt: '2026-10-04T18:15:00Z',
      items: [vip('mixed', FIRST.key, ['rank-points', 'player-events', 'crossings'])],
    },
    { kind: 'step', id: 's10', snapshotAt: '2026-10-04T18:10:00Z', items: [vip('other', SECOND.key, ['rank-points'])] },
    { kind: 'step', id: 's05', snapshotAt: '2026-10-04T18:05:00Z', items: [cashLine] },
    { kind: 'step', id: 's00', snapshotAt: '2026-10-04T18:00:00Z', items: [completed] },
  ],
  rangeNote: null,
}

/** Follows the first two VIPs, so the VIP strip has something to choose. */
const TWO: ProfileMatchRules = { exact: FIRST.name, contains: SECOND.name }
const THIRD = MODEL.vips[2]

function Harness({ rules = TWO, timeline = TIMELINE }: { rules?: ProfileMatchRules; timeline?: Timeline }) {
  const view = useTimelineView(MODEL, rules)
  return (
    <>
      <TimelineFilterBar view={view} model={MODEL} username={rules.username} />
      <TimelineRail
        timeline={timeline}
        model={MODEL}
        rules={rules}
        view={view}
        seenAt={null}
        range={{ loaded: 4, cap: 60, reach: 'window' }}
        onLoadMore={undefined}
        onRetryGap={() => {}}
        more={{ busy: false, progress: null, error: null, announcement: '' }}
      />
    </>
  )
}

const steps = () => screen.queryAllByRole('article')
const chip = (name: string | RegExp) => screen.getByRole('button', { name })

afterEach(cleanup)

describe('the filter bar', () => {
  it("shows chips with aria-pressed, defaulting to the Profile's VIPs, every kind on and High priority only off", () => {
    render(<Harness />)
    expect(chip(FIRST.name).getAttribute('aria-pressed')).toBe('true')
    expect(chip(SECOND.name).getAttribute('aria-pressed')).toBe('true')
    expect(chip(THIRD.name).getAttribute('aria-pressed')).toBe('false')
    for (const kind of ['Rank & points', 'Player events', 'Cash line', 'Crossings', 'Contest state']) {
      expect(chip(kind).getAttribute('aria-pressed')).toBe('true')
    }
    expect(chip('High priority only').getAttribute('aria-pressed')).toBe('false')
    expect(chip('Compact').getAttribute('aria-pressed')).toBe('false')
  })

  it('selects any VIP, showing their rows beside the contest-level items', () => {
    render(<Harness />)
    fireEvent.click(chip(SECOND.name))
    expect(chip(SECOND.name).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('region', { name: SECOND.name })).toBeNull()
    expect(screen.getByRole('region', { name: FIRST.name })).toBeTruthy()
    fireEvent.click(chip(FIRST.name))
    expect(screen.queryByRole('region', { name: FIRST.name })).toBeNull()
    fireEvent.click(chip(SECOND.name))
    expect(screen.getByRole('region', { name: SECOND.name })).toBeTruthy()
  })

  it('never lets the VIP filter hide the cash line or contest state', () => {
    render(<Harness />)
    fireEvent.click(chip(FIRST.name))
    fireEvent.click(chip(SECOND.name))
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.getByText(/the cash line moved/i)).toBeTruthy()
    expect(screen.getByText(/the contest is complete/i)).toBeTruthy()
  })

  it('leaves out the VIP strip for a single followed VIP', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'VIPs' })).toBeTruthy()
    cleanup()
    render(<Harness rules={{ exact: FIRST.name }} />)
    expect(screen.queryByRole('group', { name: 'VIPs' })).toBeNull()
  })

  it('shows the VIP strip for a Profile with no rules, which follows every VIP', () => {
    render(<Harness rules={{}} />)
    expect(screen.getByRole('group', { name: 'VIPs' })).toBeTruthy()
    expect(chip(SECOND.name).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('kind filter on the rail', () => {
  it('hides the other parts of a mixed row behind "+N hidden", which reveals them', () => {
    render(<Harness />)
    fireEvent.click(chip('Rank & points'))
    fireEvent.click(chip('Player events'))
    const row = screen.getByRole('region', { name: FIRST.name })
    expect(within(row).getByText(/moved into cashing/i)).toBeTruthy()
    expect(within(row).queryByRole('group', { name: 'Rank' })).toBeNull()
    const more = within(row).getByRole('button', { name: '+2 hidden' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(within(row).getByRole('group', { name: 'Rank' })).toBeTruthy()
    expect(within(row).getByRole('button', { name: /^Lineup/ })).toBeTruthy()
  })

  it('drops rows and Steps with no part of a chosen kind', () => {
    render(<Harness rules={{}} />)
    expect(steps()).toHaveLength(4)
    for (const kind of ['Rank & points', 'Player events', 'Crossings', 'Contest state']) fireEvent.click(chip(kind))
    expect(steps().map((step) => step.getAttribute('aria-label'))).toHaveLength(1)
    expect(screen.getByText(/the cash line moved/i)).toBeTruthy()
  })

  it('lets the kind filter hide Contest state', () => {
    render(<Harness />)
    fireEvent.click(chip('Contest state'))
    expect(screen.queryByText(/the contest is complete/i)).toBeNull()
    expect(steps()).toHaveLength(3)
  })
})

describe('High priority only on the rail', () => {
  it('hides the Normal parts of a mixed row behind "+N hidden" and rows with no High part', () => {
    render(<Harness rules={{}} />)
    fireEvent.click(chip('High priority only'))
    expect(chip('High priority only').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('region', { name: SECOND.name })).toBeNull()
    expect(screen.queryByText(/the cash line moved/i)).toBeNull()
    expect(screen.getByText(/the contest is complete/i)).toBeTruthy()
    const row = screen.getByRole('region', { name: FIRST.name })
    expect(within(row).getByText(/moved into cashing/i)).toBeTruthy()
    expect(within(row).queryByRole('group', { name: 'Rank' })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: '+2 hidden' }))
    expect(within(row).getByRole('group', { name: 'Rank' })).toBeTruthy()
  })
})

describe('when the filters hide everything', () => {
  it('says so with a Reset that restores the defaults but keeps Compact', () => {
    render(<Harness />)
    fireEvent.click(chip('Compact'))
    fireEvent.click(chip(THIRD.name))
    fireEvent.click(chip(FIRST.name))
    fireEvent.click(chip(SECOND.name))
    fireEvent.click(chip('Cash line'))
    for (const kind of ['Rank & points', 'Player events', 'Crossings', 'Contest state']) fireEvent.click(chip(kind))
    expect(screen.getByText('No entries match these filters')).toBeTruthy()
    expect(screen.queryByText(/hidden/i)).toBeNull()
    const message = screen.getByText('No entries match these filters')
    expect(screen.getAllByRole('button', { name: 'Reset' })).toHaveLength(2)
    fireEvent.click(within(message.parentElement as HTMLElement).getByRole('button', { name: 'Reset' }))
    expect(screen.queryByText('No entries match these filters')).toBeNull()
    expect(chip(FIRST.name).getAttribute('aria-pressed')).toBe('true')
    expect(chip(SECOND.name).getAttribute('aria-pressed')).toBe('true')
    expect(chip(THIRD.name).getAttribute('aria-pressed')).toBe('false')
    expect(chip('Cash line').getAttribute('aria-pressed')).toBe('true')
    expect(chip('High priority only').getAttribute('aria-pressed')).toBe('false')
    expect(chip('Compact').getAttribute('aria-pressed')).toBe('true')
  })

  it('still says "No VIP shifts yet" when nothing shifted and the filters are untouched', () => {
    render(<Harness timeline={{ entries: [], rangeNote: null }} />)
    expect(screen.getByText('No VIP shifts yet')).toBeTruthy()
  })
})

describe('the Reset button', () => {
  it('shows only while a filter is off its default, and resets everything but Compact', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    fireEvent.click(chip('Compact'))
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    fireEvent.click(chip('Crossings'))
    fireEvent.click(chip(THIRD.name))
    fireEvent.click(chip('High priority only'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(chip('Crossings').getAttribute('aria-pressed')).toBe('true')
    expect(chip(THIRD.name).getAttribute('aria-pressed')).toBe('false')
    expect(chip('High priority only').getAttribute('aria-pressed')).toBe('false')
    expect(chip('Compact').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
  })
})

describe('Compact', () => {
  it('renders one line per change under the Step time, with no per-VIP block, lineup expander or filtered-out line', () => {
    render(<Harness rules={{}} />)
    fireEvent.click(chip('Compact'))
    expect(chip('Compact').getAttribute('aria-pressed')).toBe('true')
    expect(steps()).toHaveLength(4)
    expect(screen.queryByRole('region', { name: FIRST.name })).toBeNull()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Lineup/ })).toBeNull()
    expect(screen.queryByText(/filtered out/i)).toBeNull()
    const newest = steps()[0]
    expect(within(newest).getByRole('time').getAttribute('datetime')).toBe('2026-10-04T18:15:00Z')
    const lines = within(newest)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain(`${FIRST.name} rank`)
    expect(lines.some((line) => line?.includes('moved into cashing'))).toBe(true)
    expect(lines.some((line) => line?.includes('Pat Player +4'))).toBe(true)
  })

  it('keeps "+N hidden" in Compact, revealing the hidden changes', () => {
    render(<Harness />)
    fireEvent.click(chip('Compact'))
    fireEvent.click(chip('Rank & points'))
    fireEvent.click(chip('Player events'))
    const newest = steps()[0]
    expect(within(newest).getAllByRole('listitem')).toHaveLength(2)
    const more = within(newest).getByRole('button', { name: '+2 hidden' })
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(within(newest).getAllByRole('listitem')).toHaveLength(4)
  })
})
