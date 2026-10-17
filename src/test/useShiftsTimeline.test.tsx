import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimelineSourceContext } from '../context/TimelineSourceContext'
import { useShiftsTimeline } from '../hooks/useShiftsTimeline'
import { SNAPSHOT_POLL_MS as TIMELINE_REFRESH_MS } from '../lib/pollInterval'
import { createTimelineSource, type TimelineOpening } from '../lib/timelineSource'
import { stamp, stubHistory, type StubOptions } from './timelineHistory'

const many = Array.from({ length: 40 }, (_, i) => i)

function setup(options: StubOptions = {}) {
  const stub = stubHistory(options)
  const source = createTimelineSource({ history: stub.history, now: () => 1, yieldToMain: async () => {} })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TimelineSourceContext.Provider value={source}>{children}</TimelineSourceContext.Provider>
    </QueryClientProvider>
  )
  const mount = () => renderHook(() => useShiftsTimeline('nfl'), { wrapper })
  return { ...stub, client, mount }
}

const stepTimes = (opening: TimelineOpening | undefined) =>
  opening?.kind === 'ready' ? opening.timeline.entries.map((entry) => `${entry.kind}:${entry.snapshotAt}`) : []
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('useShiftsTimeline', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('keeps the loaded rail when the tab is left and returned to, adding newer Steps quietly', async () => {
    const { mount, calls, publish } = setup({ slots: many })
    const first = mount()
    await waitFor(() => expect(first.result.current.opening?.kind).toBe('ready'))
    await act(async () => { await first.result.current.loadMore() })
    const longRail = stepTimes(first.result.current.opening)
    expect(longRail).toHaveLength(14)
    first.unmount()
    publish(40)
    await tick(TIMELINE_REFRESH_MS + 1000)
    calls.snapshots.length = 0
    const second = mount()
    expect(stepTimes(second.result.current.opening)).toEqual(longRail)
    await waitFor(() => expect(stepTimes(second.result.current.opening)).toHaveLength(15))
    expect(stepTimes(second.result.current.opening).slice(1)).toEqual(longRail)
    expect(calls.snapshots).toEqual(['snapshots/live-40.json'])
  })

  it('keeps the rail and exposes refreshError when a background refresh fails, clearing it on success', async () => {
    const { mount, history, publish } = setup()
    const hook = mount()
    await waitFor(() => expect(hook.result.current.opening?.kind).toBe('ready'))
    expect(hook.result.current.refreshError).toBeNull()
    const original = history.manifest
    history.manifest = async () => { throw new Error('manifest down') }
    await tick(TIMELINE_REFRESH_MS)
    expect(hook.result.current.refreshError?.message).toBe('manifest down')
    expect(hook.result.current.error).toBeNull()
    expect(stepTimes(hook.result.current.opening)).toHaveLength(4)
    history.manifest = original
    publish(7)
    await tick(TIMELINE_REFRESH_MS)
    await waitFor(() => expect(hook.result.current.refreshError).toBeNull())
    expect(stepTimes(hook.result.current.opening)).toHaveLength(5)
  })

  it('does not drop a Retry made while Load more is in flight', async () => {
    const failing = [30]
    const { mount } = setup({ slots: many, failing })
    const hook = mount()
    await waitFor(() => expect(hook.result.current.opening?.kind).toBe('ready'))
    failing.length = 0
    await act(async () => {
      const more = hook.result.current.loadMore()
      const retry = hook.result.current.retryGap(stamp(30))
      await Promise.all([more, retry])
    })
    const rail = stepTimes(hook.result.current.opening)
    expect(rail).toHaveLength(14)
    expect(rail).toContain(`step:${stamp(30)}`)
  })

  it('does not let a Retry that finishes after Load more shrink the rail', async () => {
    const failing = [37]
    const { mount } = setup({ slots: many, failing })
    const hook = mount()
    await waitFor(() => expect(hook.result.current.opening?.kind).toBe('ready'))
    failing.length = 0
    await act(async () => {
      const retry = hook.result.current.retryGap(stamp(37))
      const more = hook.result.current.loadMore()
      await Promise.all([retry, more])
    })
    const rail = stepTimes(hook.result.current.opening)
    expect(rail).toHaveLength(14)
    expect(rail).toContain(`step:${stamp(37)}`)
  })

  it('costs one latest and manifest read, not two, when a poll lands during Load more', async () => {
    const { mount, calls, publish, history } = setup({ slots: many })
    const hook = mount()
    await waitFor(() => expect(hook.result.current.opening?.kind).toBe('ready'))
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const snapshot = history.snapshot
    history.snapshot = async (path) => {
      if (/live-(2[5-9]|3[0-4])\./.test(path)) await gate
      return snapshot(path)
    }
    publish(40)
    calls.manifests.length = 0
    let more: Promise<void> = Promise.resolve()
    await act(async () => {
      more = hook.result.current.loadMore()
      await vi.advanceTimersByTimeAsync(TIMELINE_REFRESH_MS)
    })
    expect(calls.manifests).toEqual([])
    await act(async () => {
      release()
      await more
    })
    await waitFor(() => expect(stepTimes(hook.result.current.opening)).toHaveLength(15))
    expect(calls.manifests).toHaveLength(1)
  })

  it('stops polling once the contest is completed', async () => {
    const done = (snapshot: { sports: { nfl: { contests: Array<{ state: string }> } } }) => {
      snapshot.sports.nfl.contests[0].state = 'completed'
    }
    const { mount, calls } = setup({ mutate: { 6: done } })
    const hook = mount()
    await waitFor(() => expect(hook.result.current.opening?.kind).toBe('ready'))
    calls.manifests.length = 0
    await tick(TIMELINE_REFRESH_MS * 3)
    expect(calls.manifests).toEqual([])
  })
})
