import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineFilterBar } from '../components/shifts/TimelineFilterBar'
import { TimelineRail } from '../components/shifts/TimelineRail'
import type { LoadMoreState } from '../hooks/useShiftsTimeline'
import { useTimelineView } from '../hooks/useTimelineView'
import { buildLiveModel, type LiveModel } from '../lib/liveModel'
import type { ProfileMatchRules } from '../lib/profiles'
import type { ContestShiftItem, ShiftPart, Timeline, TimelineEntry, VipShiftItem } from '../lib/shifts'
import type { TimelineRange } from '../lib/timelineSource'
import { load } from './liveHarness'

const result = buildLiveModel(load(), 'nfl')
if (result.kind !== 'ready') throw new Error('fixture is not renderable')
const MODEL: LiveModel = result.model
const [FIRST, SECOND] = MODEL.vips
const move = <T,>(from: T, to: T) => ({ from, to })
const T = (minute: number) => `2026-10-04T14:${String(minute).padStart(2, '0')}:00Z`

function vip(id: string, vipKey: string, parts: ShiftPart[] = ['rank-points']): VipShiftItem {
  return { kind: 'vip', id, vipKey, priority: 'normal', detectedAt: 0, snapshotAt: T(0), parts, rank: move(20, 12), points: move(100, 110), distanceToCashPoints: move(-5, 5), distanceToCashRank: move(null, null), lineup: [] }
}
const completed: ContestShiftItem = {
  kind: 'contest-state',
  id: 'state',
  priority: 'high',
  detectedAt: 0,
  snapshotAt: T(0),
  parts: ['contest-state'],
  state: move('live', 'completed'),
  standings: [
    { vipKey: SECOND.key, rank: move(9, 7), points: move(90, 99), cashing: false },
    { vipKey: FIRST.key, rank: move(5, 3), points: move(100, 120), cashing: true },
  ],
}
const step = (id: string, at: string, items: ContestShiftItem[] | VipShiftItem[]): TimelineEntry => ({ kind: 'step', id, snapshotAt: at, items })
const clock = (minute: number) => new Date(T(minute)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

const IDLE: LoadMoreState = { busy: false, progress: null, error: null, announcement: '' }
const RANGE: TimelineRange = { loaded: 3, cap: 60, reach: 'window' }
const RULES: ProfileMatchRules = { exact: FIRST.name, contains: SECOND.name }

type RailProps = Partial<React.ComponentProps<typeof TimelineRail>>

function Harness({ timeline, rules = RULES, ...props }: RailProps & { rules?: ProfileMatchRules; timeline: Timeline }) {
  const view = useTimelineView(MODEL, rules)
  return (
    <>
      <TimelineFilterBar view={view} model={MODEL} username={rules.username} />
      <TimelineRail timeline={timeline} model={MODEL} rules={rules} view={view} seenAt={null} range={RANGE} onLoadMore={undefined} onRetryGap={vi.fn()} more={IDLE} {...props} />
    </>
  )
}

afterEach(cleanup)

const gapTimeline: Timeline = {
  entries: [step('s2', T(10), [vip('a', FIRST.key)]), { kind: 'gap', id: 'g1', snapshotAt: T(5), reason: 'unavailable' }, step('s0', T(0), [vip('b', FIRST.key)])],
  rangeNote: null,
}

describe('a failed Retry', () => {
  it('shows a visible, announced error on the gap, keeps the Retry button and clears the error on the next try', async () => {
    let settle: (value: { ok: boolean }) => void = () => {}
    const onRetryGap = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => (settle = resolve)))
    render(<Harness timeline={gapTimeline} onRetryGap={onRetryGap} />)
    const gap = screen.getByRole('group', { name: /snapshot unavailable/i })
    fireEvent.click(within(gap).getByRole('button', { name: 'Retry' }))
    await act(async () => settle({ ok: false }))
    const status = within(gap).getByRole('status')
    expect(status.textContent).toMatch(/retry failed/i)
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(within(gap).getByRole('button', { name: 'Retry' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(within(gap).getByRole('button', { name: 'Retry' }))
    expect(within(gap).getByRole('status').textContent).toBe('')
    await act(async () => settle({ ok: false }))
    expect(within(gap).getByRole('status').textContent).toMatch(/retry failed/i)
  })

  it('keeps focus on Retry while it runs, ignoring clicks until it settles', async () => {
    let settle: (value: { ok: boolean }) => void = () => {}
    const onRetryGap = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => (settle = resolve)))
    render(<Harness timeline={gapTimeline} onRetryGap={onRetryGap} />)
    const retry = within(screen.getByRole('group', { name: /snapshot unavailable/i })).getByRole('button', { name: 'Retry' })
    retry.focus()
    fireEvent.click(retry)
    expect(retry.getAttribute('aria-disabled')).toBe('true')
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(document.activeElement).toBe(retry)
    fireEvent.click(retry)
    expect(onRetryGap).toHaveBeenCalledTimes(1)
    await act(async () => settle({ ok: false }))
    expect(retry.getAttribute('aria-disabled')).not.toBe('true')
  })

  it('moves focus to the Step that replaces the gap after a successful retry', async () => {
    const onRetryGap = vi.fn(async () => ({ ok: true }))
    const { rerender } = render(<Harness timeline={gapTimeline} onRetryGap={onRetryGap} />)
    const retry = within(screen.getByRole('group', { name: /snapshot unavailable/i })).getByRole('button', { name: 'Retry' })
    retry.focus()
    fireEvent.click(retry)
    await act(async () => {})
    const filled: Timeline = { entries: [gapTimeline.entries[0], step('s1', T(5), [vip('c', FIRST.key)]), gapTimeline.entries[2]], rangeNote: null }
    rerender(<Harness timeline={filled} onRetryGap={onRetryGap} />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('article', { name: `Step at ${clock(5)}` })))
  })

  it('falls back to the rail when the retried Step has nothing to show', async () => {
    const onRetryGap = vi.fn(async () => ({ ok: true }))
    const { rerender } = render(<Harness timeline={gapTimeline} onRetryGap={onRetryGap} />)
    const retry = within(screen.getByRole('group', { name: /snapshot unavailable/i })).getByRole('button', { name: 'Retry' })
    retry.focus()
    fireEvent.click(retry)
    await act(async () => {})
    rerender(<Harness timeline={{ entries: [gapTimeline.entries[0], gapTimeline.entries[2]], rangeNote: null }} onRetryGap={onRetryGap} />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('list', { name: 'Timeline' })))
  })
})

describe('the final standings', () => {
  const finished: Timeline = { entries: [step('done', T(10), [completed])], rangeNote: null }

  it('are not hidden by the VIP filter, the Profile\'s VIPs first', () => {
    render(<Harness timeline={finished} rules={{ exact: FIRST.name }} />)
    const items = within(screen.getByRole('article')).getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(items).toHaveLength(2)
    expect(items[0]).toContain(FIRST.name)
    expect(items[1]).toContain(SECOND.name)
  })

  it('show in Compact as one "Final:" line per VIP with the place and cashing', () => {
    render(<Harness timeline={finished} rules={{ exact: FIRST.name }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    const lines = within(screen.getByRole('article')).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toContain(`Final: ${FIRST.name} 3rd, cashing`)
    expect(lines).toContain(`Final: ${SECOND.name} 7th, not cashing`)
  })
})

describe('Load more focus', () => {
  const tail: Timeline = { entries: [step('s2', T(10), [vip('a', FIRST.key)])], rangeNote: { kind: 'cap', snapshotAt: T(0) } }
  const capped: TimelineRange = { loaded: 60, cap: 60, reach: 'cap' }

  it('moves to the tail note when the user\'s own Load more ends loading', () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(<Harness timeline={tail} onLoadMore={onLoadMore} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    rerender(<Harness timeline={tail} range={capped} onLoadMore={undefined} />)
    expect(document.activeElement).toBe(screen.getByText(/cap of 60 snapshots/))
  })

  it('leaves focus and scroll alone when a background poll ends it', () => {
    const { rerender } = render(<Harness timeline={tail} onLoadMore={vi.fn()} />)
    const chip = screen.getByRole('button', { name: 'Compact' })
    chip.focus()
    rerender(<Harness timeline={tail} range={capped} onLoadMore={undefined} />)
    expect(document.activeElement).toBe(chip)
  })
})

describe('announcements', () => {
  function Live() {
    const [timeline, setTimeline] = useState<Timeline>({ entries: [step('s1', T(5), [vip('a', FIRST.key)])], rangeNote: null })
    return (
      <>
        <button onClick={() => setTimeline((t) => ({ ...t, entries: [step('s2', T(10), [vip('b', FIRST.key)]), ...t.entries] }))}>one</button>
        <button onClick={() => setTimeline((t) => ({ ...t, entries: [step('s4', T(20), [vip('d', FIRST.key)]), step('s3', T(15), [vip('c', FIRST.key)]), ...t.entries] }))}>two</button>
        <Harness timeline={timeline} />
      </>
    )
  }

  it('name the newest time, so a repeat is a new message', () => {
    render(<Live />)
    const region = screen.getByRole('status', { name: 'Timeline updates' })
    fireEvent.click(screen.getByRole('button', { name: 'one' }))
    expect(region.textContent).toBe(`New Step at ${clock(10)}`)
    fireEvent.click(screen.getByRole('button', { name: 'two' }))
    expect(region.textContent).toBe(`2 new Steps, newest ${clock(20)}`)
  })

  it('say a failed Load more once: the alert carries it, the status region does not', () => {
    render(<Harness timeline={gapTimeline} onLoadMore={vi.fn()} more={{ ...IDLE, error: 'down', announcement: 'Could not load more snapshots: down' }} />)
    expect(screen.getByRole('alert').textContent).toContain('down')
    expect(screen.getByRole('status', { name: 'Loading more' }).textContent).toBe('')
  })
})

describe('the Seen divider', () => {
  const rail: Timeline = { entries: [step('s2', T(10), [vip('a', FIRST.key)]), step('s1', T(5), [vip('b', FIRST.key)])], rangeNote: null }

  it('reads "Last looked", labelled for assistive tech, outside any list item content role', () => {
    render(<Harness timeline={rail} seenAt={T(5)} />)
    const mark = screen.getByRole('separator', { name: `You last looked at ${clock(5)}` })
    expect(mark.closest('li')?.getAttribute('role')).toBe('presentation')
    expect(screen.getByText(`Last looked · ${clock(5)}`)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Timeline' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('adds the date when the mark is on an earlier day than the newest Step', () => {
    render(<Harness timeline={rail} seenAt="2026-10-03T23:50:00Z" />)
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByText(/You last looked at .*Oct.*3.*, earlier than shown/)).toBeTruthy()
  })

  it('words the tail note for a mark before the rail', () => {
    render(<Harness timeline={rail} seenAt={T(0)} />)
    expect(screen.getByText(`You last looked at ${clock(0)}, earlier than shown`)).toBeTruthy()
  })
})

describe('structure and refresh errors', () => {
  it('puts VIP names in level-2 headings under the page title', () => {
    render(<Harness timeline={gapTimeline} />)
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('shows a non-blocking notice when a background refresh failed, keeping the rail', () => {
    const { rerender } = render(<Harness timeline={gapTimeline} />)
    expect(screen.queryByText(/could not refresh/i)).toBeNull()
    rerender(<Harness timeline={gapTimeline} refreshError={new Error('manifest down')} />)
    const notice = screen.getByText(/could not refresh the timeline/i)
    expect(notice.closest('[role="status"]')).not.toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})

describe('empty states', () => {
  const onlyGaps: Timeline = { entries: [{ kind: 'gap', id: 'g1', snapshotAt: T(5), reason: 'unavailable' }], rangeNote: null }

  it('keep gap nodes and their Retry beside "No VIP shifts yet"', () => {
    render(<Harness timeline={onlyGaps} />)
    expect(screen.getByText('No VIP shifts yet')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: /snapshot unavailable/i })).getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  const hidden: Timeline = { entries: [step('s1', T(10), [vip('x', MODEL.vips[2].key)]), onlyGaps.entries[0]], rangeNote: null }

  it('say "No shifts for your Profile\'s VIPs", without a Reset, when the default filters hide every Step', () => {
    render(<Harness timeline={hidden} rules={{ exact: FIRST.name }} />)
    expect(screen.getByText("No shifts for your Profile's VIPs")).toBeTruthy()
    expect(screen.queryByText('No VIP shifts yet')).toBeNull()
    expect(screen.queryByText('No entries match these filters')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    expect(screen.getByRole('group', { name: /snapshot unavailable/i })).toBeTruthy()
  })

  it('say "No entries match these filters" with a Reset once the filters are changed', () => {
    render(<Harness timeline={hidden} rules={{ exact: FIRST.name }} />)
    fireEvent.click(screen.getByRole('button', { name: 'High priority only' }))
    const message = screen.getByText('No entries match these filters')
    expect(within(message.parentElement as HTMLElement).getByRole('button', { name: 'Reset' })).toBeTruthy()
  })
})

describe('the High badge', () => {
  const crossing: VipShiftItem = { ...vip('hi', FIRST.key, ['rank-points', 'crossings']), priority: 'high', crossing: { path: 'in', cause: null } }
  const high: Timeline = { entries: [step('s1', T(10), [crossing])], rangeNote: null }

  it('shows while the crossing is shown and hides when its kind is filtered out', () => {
    render(<Harness timeline={high} />)
    expect(within(screen.getByRole('region', { name: FIRST.name })).getByText('High')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Crossings' }))
    expect(within(screen.getByRole('region', { name: FIRST.name })).queryByText('High')).toBeNull()
  })
})

describe('gaps the Timeline cannot show', () => {
  it('are labelled without a Retry', () => {
    const odd: TimelineEntry = { kind: 'gap', id: 'g', snapshotAt: T(5), reason: 'not-renderable' }
    render(<Harness timeline={{ entries: [step('s', T(10), [vip('a', FIRST.key)]), odd], rangeNote: null }} />)
    const gap = screen.getByRole('group', { name: `Snapshot can't be shown at ${clock(5)}` })
    expect(within(gap).queryByRole('button')).toBeNull()
  })
})
