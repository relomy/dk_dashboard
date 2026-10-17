import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileContext } from '../context/ProfileContext'
import { ShiftsContext } from '../context/ShiftsContext'
import { TimelineSourceContext } from '../context/TimelineSourceContext'
import type { ShiftsFeed } from '../lib/shifts'
import { createTimelineSource, type TimelineOpening, type TimelineSource } from '../lib/timelineSource'
import Shifts, { ShiftsSummary, ShiftsTimeline } from '../routes/Shifts'
import { load } from './liveHarness'
import { stamp, stubHistory } from './timelineHistory'

const NO_ITEMS: never[] = []

function stubFeed(): ShiftsFeed {
  return {
    record: vi.fn(),
    feed: () => NO_ITEMS,
    unseenCount: () => 0,
    unsurfaced: () => [],
    gap: () => null,
    autoAdvanced: () => false,
    seenSnapshotAt: () => null,
    markSeen: vi.fn(),
    markSurfaced: vi.fn(),
    subscribe: () => () => {},
  }
}

/** A feed whose Seen mark the test moves, notifying subscribers as the real feed does. */
function seenFeed(seenAt: string | null) {
  let seen = seenAt
  const listeners = new Set<() => void>()
  const feed: ShiftsFeed = {
    ...stubFeed(),
    seenSnapshotAt: () => seen,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return {
    feed,
    move(next: string | null) {
      seen = next
      listeners.forEach((listener) => listener())
    },
  }
}

/** The rail's order top to bottom: each Step's snapshot time, or 'seen-mark' for the divider. */
function railOrder(): string[] {
  const list = screen.getByRole('list', { name: 'Timeline' })
  return [...list.querySelectorAll('[role="separator"], time')].map((node) =>
    node.getAttribute('role') === 'separator' ? 'seen-mark' : (node.getAttribute('datetime') ?? ''),
  )
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/latest')) {
        return new Response(
          JSON.stringify({
            latest_snapshot_path: 'snapshots/live.json',
            snapshot_at: '2026-10-04T18:41:34Z',
            generated_at: '2026-10-04T18:41:34Z',
            available_sports: ['nfl'],
            manifest_today_path: 'manifest/2026-10-04.json',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify(load()), { status: 200 })
    }),
  )
}

const realSource = (history = stubHistory().history) => createTimelineSource({ history, now: () => 1, yieldToMain: async () => {} })

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderAt(path: string, options: { feed?: ShiftsFeed | null; source?: TimelineSource; rules?: Record<string, string> } = {}) {
  stubApi()
  const feed = options.feed === undefined ? stubFeed() : options.feed
  const profile = { id: 'me', name: 'Me', rules: options.rules ?? { exact: 'Cubbiesftw23' } }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <ProfileContext.Provider
          value={{
            profiles: [profile],
            activeProfileId: profile.id,
            activeProfile: profile,
            setActiveProfileId: () => {},
            addProfile: () => {},
            updateProfile: () => {},
            deleteProfile: () => {},
          }}
        >
          <ShiftsContext.Provider value={feed}>
            <TimelineSourceContext.Provider value={options.source ?? realSource()}>
              <Routes>
                <Route path="/shifts/:sport" element={<Shifts />}>
                  <Route index element={<ShiftsSummary />} />
                  <Route path="timeline" element={<ShiftsTimeline />} />
                </Route>
              </Routes>
              <Where />
            </TimelineSourceContext.Provider>
          </ShiftsContext.Provider>
        </ProfileContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

describe('the Timeline tab', () => {
  it('is a tab beside Summary that links to its own per-sport address', async () => {
    renderAt('/shifts/nfl')
    expect(await screen.findByRole('tab', { name: 'Summary', selected: true })).toBeTruthy()
    const tab = screen.getByRole('tab', { name: 'Timeline', selected: false })
    expect(tab.getAttribute('href')).toBe('/shifts/nfl/timeline')
    fireEvent.click(tab)
    expect(screen.getByTestId('where').textContent).toBe('/shifts/nfl/timeline')
    expect(await screen.findByRole('tab', { name: 'Timeline', selected: true })).toBeTruthy()
  })

  it('fetches nothing for the Timeline until its tab is visited', async () => {
    const open = vi.fn<TimelineSource['open']>(async () => ({ kind: 'not-renderable', reason: { kind: 'sport-missing' } }))
    renderAt('/shifts/nfl', { source: { open } })
    await screen.findByRole('tab', { name: 'Summary', selected: true })
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('nfl', expect.anything()))
  })

  it('opens straight onto the rail when reloaded at its address', async () => {
    renderAt('/shifts/nfl/timeline')
    expect(await screen.findByRole('tab', { name: 'Timeline', selected: true })).toBeTruthy()
    expect(await screen.findAllByRole('article')).toHaveLength(4)
  })

  it('renders the Steps newest first, each timestamped with its snapshot time', async () => {
    renderAt('/shifts/nfl/timeline')
    const steps = await screen.findAllByRole('article')
    const times = steps.map((step) => within(step).getByRole('time').getAttribute('datetime'))
    expect(times).toEqual([6, 5, 4, 3].map(stamp))
  })

  it('shows one row per followed VIP, by name, and only the active Profile\'s VIPs', async () => {
    renderAt('/shifts/nfl/timeline', { rules: { exact: 'Cubbiesftw23' } })
    const steps = await screen.findAllByRole('article')
    for (const step of steps) {
      expect(within(step).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Cubbiesftw23'])
    }
    expect(screen.queryByText('cglenn91')).toBeNull()
    cleanup()
    renderAt('/shifts/nfl/timeline', { rules: { exact: 'cglenn91' } })
    const other = await screen.findAllByRole('article')
    expect(within(other[0]).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['cglenn91'])
  })

  it('follows every VIP when the active Profile has no rules', async () => {
    renderAt('/shifts/nfl/timeline', { rules: {} })
    const [newest] = await screen.findAllByRole('article')
    const names = within(newest).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual(expect.arrayContaining(['cglenn91', 'Cubbiesftw23']))
  })

  it('shows the figures that moved and a collapsed lineup diff that expands', async () => {
    renderAt('/shifts/nfl/timeline')
    const [newest] = await screen.findAllByRole('article')
    expect(within(newest).getByRole('group', { name: 'Rank' }).textContent).toContain('→')
    const expander = within(newest).getByRole('button', { name: /^Lineup/ })
    expect(expander.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expander)
    expect(expander.getAttribute('aria-expanded')).toBe('true')
  })

  it('announces loading politely with progress, then removes it', async () => {
    let finish: (value: Awaited<ReturnType<TimelineSource['open']>>) => void = () => {}
    const open: TimelineSource['open'] = (_sport, options) => {
      options?.onProgress?.(2, 5)
      return new Promise((resolve) => (finish = resolve))
    }
    renderAt('/shifts/nfl/timeline', { source: { open } })
    const status = await screen.findByText(/loading the timeline/i)
    expect(status.getAttribute('role')).toBe('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    await waitFor(() => expect(status.textContent).toContain('2 of 5'))
    finish({ kind: 'ready', inputs: [], timeline: { entries: [], rangeNote: null }, range: { loaded: 0, cap: 60, reach: 'window' } })
    await waitFor(() => expect(screen.queryByText(/loading the timeline/i)).toBeNull())
  })

  it('shows an error with a retry when the source fails, and retries', async () => {
    const open = vi.fn<TimelineSource['open']>()
    open.mockRejectedValueOnce(new Error('manifest down'))
    open.mockResolvedValueOnce({ kind: 'ready', inputs: [], timeline: { entries: [], rangeNote: null }, range: { loaded: 0, cap: 60, reach: 'window' } })
    renderAt('/shifts/nfl/timeline', { source: { open } })
    expect((await screen.findByRole('alert')).textContent).toContain('manifest down')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No VIP shifts yet')).toBeTruthy()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('shows the nothing-to-follow message when the source finds nothing renderable', async () => {
    const open: TimelineSource['open'] = async () => ({ kind: 'not-renderable', reason: { kind: 'no-primary-contest' } })
    renderAt('/shifts/nfl/timeline', { source: { open } })
    expect(await screen.findByText('There is nothing to follow live for this sport.')).toBeTruthy()
  })

  it('says "No VIP shifts yet" when no Step has anything to show', async () => {
    const flat = stubHistory({ mutate: Object.fromEntries([2, 3, 4, 5, 6].map((slot) => [slot, (s: { sports: { nfl: { contests: Array<{ vip_lineups: Array<Record<string, number>> }> } } }) => s.sports.nfl.contests[0].vip_lineups.forEach((vip) => { vip.rank = 900; vip.points = 10 })])) })
    renderAt('/shifts/nfl/timeline', { source: realSource(flat.history) })
    expect(await screen.findByText('No VIP shifts yet')).toBeTruthy()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('gives a non-owner the same "Shifts are not available" message and loads nothing', async () => {
    const open = vi.fn<TimelineSource['open']>()
    renderAt('/shifts/nfl/timeline', { feed: null, source: { open } })
    expect(await screen.findByText('Shifts are not available.')).toBeTruthy()
    expect(open).not.toHaveBeenCalled()
  })

  describe('gaps', () => {
    it('marks a failed snapshot as unavailable between the Steps, saying shifts inside it may be lost, with a retry', async () => {
      renderAt('/shifts/nfl/timeline', { source: realSource(stubHistory({ failing: [4] }).history) })
      const gap = await screen.findByRole('group', { name: /snapshot unavailable/i })
      expect(within(gap).getByText(/shifts inside it may be lost/i)).toBeTruthy()
      expect(within(gap).getByRole('button', { name: /retry/i })).toBeTruthy()
      expect(screen.getAllByRole('article')).toHaveLength(3)
    })

    it('retries only the failed snapshot and fills the Step', async () => {
      const failing = [4]
      const { history, calls } = stubHistory({ failing })
      renderAt('/shifts/nfl/timeline', { source: realSource(history) })
      const gap = await screen.findByRole('group', { name: /snapshot unavailable/i })
      failing.length = 0
      calls.snapshots.length = 0
      fireEvent.click(within(gap).getByRole('button', { name: /retry/i }))
      await waitFor(() => expect(screen.queryByRole('group', { name: /snapshot unavailable/i })).toBeNull())
      expect(calls.snapshots).toEqual(['snapshots/live-4.json'])
      expect(screen.getAllByRole('article')).toHaveLength(4)
    })

    it('keeps the gap and its retry when the retry fails', async () => {
      renderAt('/shifts/nfl/timeline', { source: realSource(stubHistory({ failing: [4] }).history) })
      const gap = await screen.findByRole('group', { name: /snapshot unavailable/i })
      fireEvent.click(within(gap).getByRole('button', { name: /retry/i }))
      await waitFor(() => expect(within(screen.getByRole('group', { name: /snapshot unavailable/i })).getByRole('button', { name: /retry/i }).hasAttribute('disabled')).toBe(false))
      expect(screen.getByRole('group', { name: /snapshot unavailable/i })).toBeTruthy()
    })

    it('marks a not-fresh snapshot with no retry', async () => {
      renderAt('/shifts/nfl/timeline', { source: realSource(stubHistory({ stale: [4] }).history) })
      const gap = await screen.findByRole('group', { name: /not fresh/i })
      expect(within(gap).getByText(/shifts inside it may be lost/i)).toBeTruthy()
      expect(within(gap).queryByRole('button')).toBeNull()
    })

    it('makes the retry keyboard operable with a visible focus ring', async () => {
      renderAt('/shifts/nfl/timeline', { source: realSource(stubHistory({ failing: [4] }).history) })
      const retry = within(await screen.findByRole('group', { name: /snapshot unavailable/i })).getByRole('button', { name: /retry/i })
      expect(retry.tagName).toBe('BUTTON')
      expect(retry.className).toMatch(/focus-visible:ring/)
    })
  })

  describe('range and Load more', () => {
    const clock = (slot: number) => new Date(stamp(slot)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    const sourceFor = (slots: number[], extra: Partial<Parameters<typeof createTimelineSource>[0]> = {}, stub: Parameters<typeof stubHistory>[0] = {}) =>
      createTimelineSource({ history: stubHistory({ slots, ...stub }).history, now: () => 1, yieldToMain: async () => {}, ...extra })
    const long = Array.from({ length: 30 }, (_, i) => i)

    it('shows a sticky range meter of snapshots loaded out of the cap, as a labelled progressbar', async () => {
      renderAt('/shifts/nfl/timeline', { source: sourceFor(long) })
      const meter = await screen.findByRole('progressbar', { name: /snapshots loaded/i })
      expect(meter.getAttribute('aria-valuenow')).toBe('5')
      expect(meter.getAttribute('aria-valuemin')).toBe('0')
      expect(meter.getAttribute('aria-valuemax')).toBe('60')
      expect(meter.getAttribute('aria-valuetext')).toBe('5 of 60 snapshots')
      expect(meter.closest('[class*="sticky"]')).not.toBeNull()
      expect(screen.getByText('5 of 60 snapshots')).toBeTruthy()
    })

    it('offers Load more at the tail of the rail while there is more, with no range note yet', async () => {
      renderAt('/shifts/nfl/timeline', { source: sourceFor(long) })
      const button = await screen.findByRole('button', { name: 'Load more' })
      expect(button.className).toMatch(/focus-visible:ring/)
      expect(screen.queryByText(/loaded history ends/i)).toBeNull()
    })

    it('adds older Steps at the tail on click and updates the meter', async () => {
      renderAt('/shifts/nfl/timeline', { source: sourceFor(long) })
      await screen.findAllByRole('article')
      expect(screen.getAllByRole('article')).toHaveLength(4)
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
      await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(14))
      expect(screen.getByRole('progressbar', { name: /snapshots loaded/i }).getAttribute('aria-valuenow')).toBe('15')
      expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
    })

    it('is busy while loading: the button is aria-busy and inert, and the meter shows the progress', async () => {
      let finish: (opening: TimelineOpening) => void = () => {}
      const loadMore = vi.fn((options?: { onProgress?: (done: number, total: number) => void }) => {
        options?.onProgress?.(3, 10)
        return new Promise<TimelineOpening>((resolve) => (finish = resolve))
      })
      const real = sourceFor(long)
      const source: TimelineSource = {
        open: async (sport, options) => {
          const opened = await real.open(sport, options)
          return opened.kind === 'ready' ? { ...opened, loadMore } : opened
        },
      }
      renderAt('/shifts/nfl/timeline', { source })
      fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
      const busy = await screen.findByRole('button', { name: /loading more/i })
      expect(busy.getAttribute('aria-busy')).toBe('true')
      expect(busy.getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(busy)
      expect(loadMore).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('progressbar', { name: /snapshots loaded/i }).getAttribute('aria-busy')).toBe('true')
      expect(screen.getByText(/loading 3 of 10/i)).toBeTruthy()
      const opened = await real.open('nfl')
      finish(opened)
      await waitFor(() => expect(screen.queryByRole('button', { name: /loading more/i })).toBeNull())
    })

    it('announces loading and the result through the polite live region', async () => {
      renderAt('/shifts/nfl/timeline', { source: sourceFor(long) })
      fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
      await waitFor(() => expect(screen.getAllByRole('status').some((node) => /loaded 10 more snapshots/i.test(node.textContent ?? ''))).toBe(true))
      const live = screen.getAllByRole('status').find((node) => /loaded 10 more/i.test(node.textContent ?? ''))
      expect(live?.getAttribute('aria-live')).toBe('polite')
    })

    it('ends at the loaded history with a "From HH:MM" note and no Load more', async () => {
      renderAt('/shifts/nfl/timeline', { source: sourceFor([0, 1, 2, 3, 4, 5, 6]) })
      fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
      expect(await screen.findByText(new RegExp(`From ${clock(0)}`))).toBeTruthy()
      expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
    })

    it('ends at the contest start with its own note', async () => {
      const rotated = (snapshot: { sports: { nfl: { contests: Array<{ name: string }> } } }) => {
        snapshot.sports.nfl.contests[0].name = 'Yesterday slate'
      }
      renderAt('/shifts/nfl/timeline', { source: sourceFor([0, 1, 2, 3, 4, 5, 6], {}, { mutate: { 0: rotated, 1: rotated } }) })
      fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
      expect(await screen.findByText(new RegExp(`contest start.*${clock(2)}`, 'i'))).toBeTruthy()
      expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
    })

    it('ends at the cap with its own note', async () => {
      renderAt('/shifts/nfl/timeline', { source: sourceFor(long, { cap: 8 }) })
      fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
      expect(await screen.findByText(/cap of 8 snapshots/i)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
      expect(screen.getByRole('progressbar', { name: /snapshots loaded/i }).getAttribute('aria-valuenow')).toBe('8')
    })

    it('shows an alert and keeps Load more usable when loading fails', async () => {
      const real = sourceFor(long)
      const loadMore = vi.fn()
      const source: TimelineSource = {
        open: async (sport, options) => {
          const opened = await real.open(sport, options)
          if (opened.kind !== 'ready') return opened
          loadMore.mockImplementation(opened.loadMore!)
          loadMore.mockRejectedValueOnce(new Error('yesterday down'))
          return { ...opened, loadMore }
        },
      }
      renderAt('/shifts/nfl/timeline', { source })
      fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
      expect((await screen.findByRole('alert')).textContent).toContain('yesterday down')
      const again = screen.getByRole('button', { name: 'Load more' })
      expect(again.getAttribute('aria-busy')).not.toBe('true')
      fireEvent.click(again)
      await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(14))
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})

describe("the Seen mark's divider", () => {
  it('sits between the unseen steps above and the seen steps below', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(stamp(4)).feed })
    await screen.findAllByRole('article')
    expect(railOrder()).toEqual([stamp(6), stamp(5), 'seen-mark', stamp(4), stamp(3)])
  })

  it('is a labelled separator across the rail', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(stamp(4)).feed })
    expect(await screen.findByRole('separator', { name: /^Seen mark/ })).toBeTruthy()
  })

  it('is absent when nothing has been seen, with no tail note', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(null).feed })
    await screen.findAllByRole('article')
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByText(/further back/)).toBeNull()
  })

  it('sits at the top when the Seen mark is the newest step', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(stamp(6)).feed })
    await screen.findAllByRole('article')
    expect(railOrder()).toEqual(['seen-mark', stamp(6), stamp(5), stamp(4), stamp(3)])
  })

  it('sits at the bottom when the Seen mark is the oldest loaded snapshot', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(stamp(2)).feed })
    await screen.findAllByRole('article')
    expect(railOrder()).toEqual([stamp(6), stamp(5), stamp(4), stamp(3), 'seen-mark'])
  })

  it('gives a tail note and fetches nothing extra when the Seen mark lies before the loaded range', async () => {
    const seen = seenFeed(stamp(4))
    const { history, calls } = stubHistory()
    renderAt('/shifts/nfl/timeline', { feed: seen.feed, source: realSource(history) })
    await screen.findAllByRole('article')
    const fetched = calls.snapshots.length
    act(() => seen.move(stamp(0)))
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByText('Unseen shifts exist further back than this Timeline reaches.')).toBeTruthy()
    expect(calls.snapshots).toHaveLength(fetched)
  })

  it('moves when the Seen mark moves while the Timeline is open', async () => {
    const seen = seenFeed(stamp(4))
    renderAt('/shifts/nfl/timeline', { feed: seen.feed })
    await screen.findAllByRole('article')
    act(() => seen.move(stamp(5)))
    expect(railOrder()).toEqual([stamp(6), 'seen-mark', stamp(5), stamp(4), stamp(3)])
  })

  it('never marks anything seen', async () => {
    const seen = seenFeed(stamp(4))
    renderAt('/shifts/nfl/timeline', { feed: seen.feed })
    await screen.findAllByRole('article')
    expect(seen.feed.markSeen).not.toHaveBeenCalled()
  })
})

describe('a live Timeline', () => {
  const REFRESH = 300_000
  let visibility = 'visible'
  const setVisibility = (state: 'visible' | 'hidden') => {
    visibility = state
    document.dispatchEvent(new Event('visibilitychange'))
  }
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  beforeEach(() => {
    visibility = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('adds new Steps at the top on the refetch interval without remounting the existing ones', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    const before = await screen.findAllByRole('article')
    stub.calls.snapshots.length = 0
    stub.publish(7)
    await tick(REFRESH)
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5))
    const after = screen.getAllByRole('article')
    expect(after.map((step) => within(step).getByRole('time').getAttribute('datetime'))).toEqual([7, 6, 5, 4, 3].map(stamp))
    after.slice(1).forEach((node, i) => expect(node).toBe(before[i]))
    expect(stub.calls.snapshots).toEqual(['snapshots/live-7.json'])
  })

  it('announces new Steps politely and not the ones it opened with', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    await screen.findAllByRole('article')
    const region = screen.getByRole('status', { name: 'Timeline updates' })
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toBe('')
    stub.publish(7)
    await tick(REFRESH)
    await waitFor(() => expect(region.textContent).toBe('1 new Step'))
    stub.publish(8)
    stub.publish(9)
    await tick(REFRESH)
    await waitFor(() => expect(region.textContent).toBe('2 new Steps'))
  })

  it('animates a new Step only when motion is allowed', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    await screen.findAllByRole('article')
    stub.publish(7)
    await tick(REFRESH)
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5))
    const [newest, older] = screen.getAllByRole('article')
    expect(newest.closest('li')?.className).toMatch(/motion-safe:animate-in/)
    expect(newest.closest('li')?.className).not.toMatch(/(^|\s)animate-in/)
    expect(older.closest('li')?.className).not.toMatch(/animate-in/)
  })

  it('polls nothing while hidden and catches up when visible again', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    await screen.findAllByRole('article')
    setVisibility('hidden')
    stub.calls.manifests.length = 0
    stub.publish(7)
    await tick(REFRESH * 3)
    expect(stub.calls.manifests).toEqual([])
    expect(screen.getAllByRole('article')).toHaveLength(4)
    setVisibility('visible')
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5))
    expect(stub.calls.snapshots.filter((path) => path.endsWith('live-7.json'))).toHaveLength(1)
  })

  it('does not refetch on a quick return to the tab', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    await screen.findAllByRole('article')
    stub.calls.manifests.length = 0
    setVisibility('hidden')
    await tick(1000)
    setVisibility('visible')
    await tick(1000)
    expect(stub.calls.manifests).toEqual([])
  })

  it('stops polling once the Timeline is left', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
    stub.calls.manifests.length = 0
    await tick(REFRESH * 2)
    expect(stub.calls.manifests).toEqual([])
  })

  it('keeps the Timeline on screen when a refresh fails and tries again next time', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    await screen.findAllByRole('article')
    const original = stub.history.manifest
    stub.history.manifest = async () => { throw new Error('manifest down') }
    await tick(REFRESH)
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.queryByRole('alert')).toBeNull()
    stub.history.manifest = original
    stub.publish(7)
    await tick(REFRESH)
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5))
  })
})

describe('Timeline filters and Compact', () => {
  it('keeps the filters and Compact across the Summary and Timeline tabs', async () => {
    renderAt('/shifts/nfl/timeline')
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crossings' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
    expect(screen.queryByRole('button', { name: 'Compact' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    await screen.findAllByRole('article')
    expect(screen.getByRole('button', { name: 'Compact' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Crossings' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('starts from the defaults on a fresh load and writes nothing to the URL or storage', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    renderAt('/shifts/nfl/timeline')
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    fireEvent.click(screen.getByRole('button', { name: 'High priority only' }))
    expect(screen.getByTestId('where').textContent).toBe('/shifts/nfl/timeline')
    expect(write).not.toHaveBeenCalled()
    cleanup()
    renderAt('/shifts/nfl/timeline')
    await screen.findAllByRole('article')
    expect(screen.getByRole('button', { name: 'Compact' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'High priority only' }).getAttribute('aria-pressed')).toBe('false')
    write.mockRestore()
  })

  it('omits the VIP strip when the Profile follows a single VIP and shows it otherwise', async () => {
    renderAt('/shifts/nfl/timeline', { rules: { exact: 'Cubbiesftw23' } })
    await screen.findAllByRole('article')
    expect(screen.queryByRole('group', { name: 'VIPs' })).toBeNull()
    cleanup()
    renderAt('/shifts/nfl/timeline', { rules: {} })
    await screen.findAllByRole('article')
    expect(screen.getByRole('group', { name: 'VIPs' })).toBeTruthy()
  })

  it('shows "No entries match these filters" with Reset when the filters hide every Step', async () => {
    renderAt('/shifts/nfl/timeline')
    await screen.findAllByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'High priority only' }))
    expect(screen.getByText('No entries match these filters')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(await screen.findAllByRole('article')).toHaveLength(4)
  })
})
