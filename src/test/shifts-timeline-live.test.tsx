import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clockAt, railOrder, realSource, renderAt, seenFeed } from './shiftsTimelineTestKit'
import { stamp, stubHistory } from './timelineHistory'

describe("the Seen mark's divider", () => {
  it('sits between the unseen steps above and the seen steps below', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(stamp(4)).feed })
    await screen.findAllByRole('article')
    expect(railOrder()).toEqual([stamp(6), stamp(5), 'seen-mark', stamp(4), stamp(3)])
  })

  it('is a labelled separator across the rail', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(stamp(4)).feed })
    expect(await screen.findByRole('separator', { name: /^You last looked at/ })).toBeTruthy()
  })

  it('is absent when nothing has been seen, with no tail note', async () => {
    renderAt('/shifts/nfl/timeline', { feed: seenFeed(null).feed })
    await screen.findAllByRole('article')
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByText(/earlier than shown/)).toBeNull()
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
    expect(screen.getByText(/^You last looked at .*, earlier than shown$/)).toBeTruthy()
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
  const tick = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })

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
    expect(after.map((step) => within(step).getByRole('time').getAttribute('datetime'))).toEqual(
      [7, 6, 5, 4, 3].map(stamp),
    )
    after.slice(1).forEach((node, i) => expect(node).toBe(before[i]))
    expect(stub.calls.snapshots).toEqual(['snapshots/live-7.json'])
  })

  it('keeps the rail and shows a non-blocking notice when a refresh fails, clearing it once one succeeds', async () => {
    const stub = stubHistory()
    renderAt('/shifts/nfl/timeline', { source: realSource(stub.history) })
    await screen.findAllByRole('article')
    const manifest = stub.history.manifest
    stub.history.manifest = async () => {
      throw new Error('manifest down')
    }
    await tick(REFRESH)
    expect(await screen.findByText(/could not refresh the timeline/i)).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(4)
    stub.history.manifest = manifest
    stub.publish(7)
    await tick(REFRESH)
    await waitFor(() => expect(screen.queryByText(/could not refresh the timeline/i)).toBeNull())
    expect(screen.getAllByRole('article')).toHaveLength(5)
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
    await waitFor(() => expect(region.textContent).toBe(`New Step at ${clockAt(7)}`))
    stub.publish(8)
    stub.publish(9)
    await tick(REFRESH)
    await waitFor(() => expect(region.textContent).toBe(`2 new Steps, newest ${clockAt(9)}`))
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
    stub.history.manifest = async () => {
      throw new Error('manifest down')
    }
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
    const message = screen.getByText('No entries match these filters')
    expect(screen.getAllByRole('button', { name: 'Reset' })).toHaveLength(2)
    fireEvent.click(within(message.parentElement as HTMLElement).getByRole('button', { name: 'Reset' }))
    expect(await screen.findAllByRole('article')).toHaveLength(4)
  })
})
