import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { type TimelineOpening, type TimelineSource, createTimelineSource } from '../lib/timelineSource'
import { clockAt, realSource, renderAt } from './shiftsTimelineTestKit'
import { stamp, stubHistory } from './timelineHistory'

describe('the Timeline tab', () => {
  it('is a tab beside Summary that links to its own per-sport address', async () => {
    renderAt('/shifts/nfl')
    expect(await screen.findByRole('tab', { name: 'Summary', selected: true })).toBeTruthy()
    const tab = screen.getByRole('tab', { name: 'Timeline', selected: false })
    fireEvent.click(tab)
    expect(screen.getByTestId('where').textContent).toBe('/shifts/nfl/timeline')
    expect(await screen.findByRole('tab', { name: 'Timeline', selected: true })).toBeTruthy()
  })

  it('follows the WAI-ARIA tabs pattern: arrow keys switch the panel, Space and Enter activate', async () => {
    renderAt('/shifts/nfl')
    const summary = await screen.findByRole('tab', { name: 'Summary', selected: true })
    summary.focus()
    fireEvent.keyDown(summary, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/shifts/nfl/timeline'))
    const timeline = await screen.findByRole('tab', { name: 'Timeline', selected: true })
    expect(document.activeElement).toBe(timeline)
    fireEvent.keyDown(timeline, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/shifts/nfl'))
    expect(await screen.findByRole('tab', { name: 'Summary', selected: true })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Timeline' }), { key: ' ' })
    expect(screen.getByTestId('where').textContent).toBe('/shifts/nfl/timeline')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Summary' }), { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toBe('/shifts/nfl')
  })

  it('fetches nothing for the Timeline until its tab is visited', async () => {
    const open = vi.fn<TimelineSource['open']>(async () => ({
      kind: 'not-renderable',
      reason: { kind: 'sport-missing' },
    }))
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

  it("shows one row per followed VIP, by name, and only the active Profile's VIPs", async () => {
    renderAt('/shifts/nfl/timeline', { rules: { exact: 'Cubbiesftw23' } })
    const steps = await screen.findAllByRole('article')
    for (const step of steps) {
      expect(
        within(step)
          .getAllByRole('heading', { level: 2 })
          .map((h) => h.textContent),
      ).toEqual(['Cubbiesftw23'])
    }
    expect(screen.queryByText('cglenn91')).toBeNull()
    cleanup()
    renderAt('/shifts/nfl/timeline', { rules: { exact: 'cglenn91' } })
    const other = await screen.findAllByRole('article')
    expect(
      within(other[0])
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['cglenn91'])
  })

  it('follows every VIP when the active Profile has no rules', async () => {
    renderAt('/shifts/nfl/timeline', { rules: {} })
    const [newest] = await screen.findAllByRole('article')
    const names = within(newest)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
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

  it('announces loading once, shows the progress without announcing each tick, and announces completion', async () => {
    let finish: (value: Awaited<ReturnType<TimelineSource['open']>>) => void = () => {}
    const open: TimelineSource['open'] = (_sport, options) => {
      options?.onProgress?.(2, 5)
      return new Promise((resolve) => (finish = resolve))
    }
    renderAt('/shifts/nfl/timeline', { source: { open } })
    const status = await screen.findByText(/loading the timeline/i)
    expect(status.getAttribute('role')).toBe('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    const progress = await screen.findByText(/2 of 5/)
    expect(progress.closest('[role="status"]')).toBeNull()
    expect(status.textContent).not.toContain('2 of 5')
    finish({
      kind: 'ready',
      completed: false,
      timeline: { entries: [], rangeNote: null },
      range: { loaded: 0, cap: 60, reach: 'window' },
    })
    await waitFor(() => expect(screen.queryByText(/loading the timeline/i)).toBeNull())
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Timeline loaded')).toBe(true)
  })

  it('shows an error with a retry when the source fails, and retries', async () => {
    const open = vi.fn<TimelineSource['open']>()
    open.mockRejectedValueOnce(new Error('manifest down'))
    open.mockResolvedValueOnce({
      kind: 'ready',
      completed: false,
      timeline: { entries: [], rangeNote: null },
      range: { loaded: 0, cap: 60, reach: 'window' },
    })
    renderAt('/shifts/nfl/timeline', { source: { open } })
    expect((await screen.findByRole('alert')).textContent).toContain('manifest down')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No VIP shifts yet')).toBeTruthy()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('shows the nothing-to-follow message when the source finds nothing renderable', async () => {
    const open: TimelineSource['open'] = async () => ({
      kind: 'not-renderable',
      reason: { kind: 'no-primary-contest' },
    })
    renderAt('/shifts/nfl/timeline', { source: { open } })
    expect(await screen.findByText('There is nothing to follow live for this sport.')).toBeTruthy()
  })

  it('says "No VIP shifts yet" when no Step has anything to show', async () => {
    const flat = stubHistory({
      mutate: Object.fromEntries(
        [2, 3, 4, 5, 6].map((slot) => [
          slot,
          (s: { sports: { nfl: { contests: Array<{ vip_lineups: Array<Record<string, number>> }> } } }) =>
            s.sports.nfl.contests[0].vip_lineups.forEach((vip) => {
              vip.rank = 900
              vip.points = 10
            }),
        ]),
      ),
    })
    renderAt('/shifts/nfl/timeline', { source: realSource(flat.history) })
    expect(await screen.findByText('No VIP shifts yet')).toBeTruthy()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
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
      await waitFor(() =>
        expect(
          within(screen.getByRole('group', { name: /snapshot unavailable/i }))
            .getByRole('button', { name: /retry/i })
            .hasAttribute('disabled'),
        ).toBe(false),
      )
      expect(screen.getByRole('group', { name: /snapshot unavailable/i })).toBeTruthy()
    })

    it('says the retry failed when the snapshot is still unavailable', async () => {
      renderAt('/shifts/nfl/timeline', { source: realSource(stubHistory({ failing: [4] }).history) })
      const gap = await screen.findByRole('group', { name: /snapshot unavailable/i })
      fireEvent.click(within(gap).getByRole('button', { name: /retry/i }))
      expect((await screen.findByText(/retry failed/i)).getAttribute('role')).toBe('status')
      expect(screen.getByRole('group', { name: /snapshot unavailable/i })).toBeTruthy()
    })

    it('labels a snapshot the Timeline cannot render, with no retry', async () => {
      const stub = stubHistory({ mutate: { 4: (snapshot) => delete snapshot.sports.nfl.primary_contest } })
      renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
      const gap = await screen.findByRole('group', { name: `Snapshot can't be shown at ${clockAt(4)}` })
      expect(within(gap).queryByRole('button')).toBeNull()
    })

    it('marks a not-fresh snapshot with no retry', async () => {
      renderAt('/shifts/nfl/timeline', { source: realSource(stubHistory({ stale: [4] }).history) })
      const gap = await screen.findByRole('group', { name: /not fresh/i })
      expect(within(gap).getByText(/shifts inside it may be lost/i)).toBeTruthy()
      expect(within(gap).queryByRole('button')).toBeNull()
    })

    it('makes the retry keyboard operable with a visible focus ring', async () => {
      renderAt('/shifts/nfl/timeline', { source: realSource(stubHistory({ failing: [4] }).history) })
      const retry = within(await screen.findByRole('group', { name: /snapshot unavailable/i })).getByRole('button', {
        name: /retry/i,
      })
      expect(retry.tagName).toBe('BUTTON')
      expect(retry.className).toMatch(/focus-visible:ring/)
    })
  })

  describe('range and Load more', () => {
    const clock = (slot: number) =>
      new Date(stamp(slot)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    const sourceFor = (
      slots: number[],
      extra: Partial<Parameters<typeof createTimelineSource>[0]> = {},
      stub: Parameters<typeof stubHistory>[0] = {},
    ) =>
      createTimelineSource({
        history: stubHistory({ slots, ...stub }).history,
        now: () => 1,
        yieldToMain: async () => {},
        ...extra,
      })
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
      await waitFor(() =>
        expect(
          screen.getAllByRole('status').some((node) => /loaded 10 more snapshots/i.test(node.textContent ?? '')),
        ).toBe(true),
      )
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
      renderAt('/shifts/nfl/timeline', {
        source: sourceFor([0, 1, 2, 3, 4, 5, 6], {}, { mutate: { 0: rotated, 1: rotated } }),
      })
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
