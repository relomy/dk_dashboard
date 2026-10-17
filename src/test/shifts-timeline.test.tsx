import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileContext } from '../context/ProfileContext'
import { ShiftsContext } from '../context/ShiftsContext'
import { TimelineSourceContext } from '../context/TimelineSourceContext'
import type { ShiftsFeed } from '../lib/shifts'
import { createTimelineSource, type TimelineSource } from '../lib/timelineSource'
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
    markSeen: vi.fn(),
    markSurfaced: vi.fn(),
    subscribe: () => () => {},
  }
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
    finish({ kind: 'ready', inputs: [], timeline: { entries: [], rangeNote: null } })
    await waitFor(() => expect(screen.queryByText(/loading the timeline/i)).toBeNull())
  })

  it('shows an error with a retry when the source fails, and retries', async () => {
    const open = vi.fn<TimelineSource['open']>()
    open.mockRejectedValueOnce(new Error('manifest down'))
    open.mockResolvedValueOnce({ kind: 'ready', inputs: [], timeline: { entries: [], rangeNote: null } })
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
})
