import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { createLimiter, type TimelineHistory, type TimelineOpening } from '../timelineSource'
import { stamp, stubHistory } from '../../test/timelineHistory'
import { sourceOf } from './timelineSourceTestKit'

describe('the fetch limiter', () => {
  it('never lets a caller arriving as a slot is released run beside the waiter that was handed it', async () => {
    // A caller lands a few microtasks after the release; whichever microtask lines up with the hand-over, the bound holds.
    for (let delay = 0; delay <= 10; delay += 1) {
      const run = createLimiter(1)
      let active = 0
      let peak = 0
      const task = (gate: Promise<void>) => async () => {
        peak = Math.max(peak, ++active)
        await gate
        active -= 1
      }
      let release: () => void = () => {}
      const first = run(
        task(
          new Promise<void>((resolve) => {
            release = resolve
          }),
        ),
      )
      const waiter = run(task(Promise.resolve()))
      release()
      const barger = (async () => {
        for (let i = 0; i < delay; i += 1) await Promise.resolve()
        await run(task(Promise.resolve()))
      })()
      await Promise.all([first, waiter, barger])
      expect(peak, `delay ${delay}`).toBe(1)
    }
  })
})

describe('overlapping source calls', () => {
  const many = Array.from({ length: 40 }, (_, i) => i)

  it('share one fetch bound across Load more, refresh and a gap retry', async () => {
    const failing = [4]
    const { history, calls, publish } = stubHistory({ slots: many, failing })
    const opened = await sourceOf(history, { fetchBound: 2 }).open('nfl')
    if (opened.kind !== 'ready' || !opened.loadMore || !opened.refresh || !opened.retryGap)
      throw new Error('expected a full opening')
    failing.length = 0
    publish(40)
    publish(41)
    publish(42)
    calls.maxInFlight = 0
    await Promise.all([opened.loadMore(), opened.refresh(), opened.retryGap(stamp(4))])
    expect(calls.maxInFlight).toBe(2)
  })
})

describe('the end of the window', () => {
  const ready = (opening: TimelineOpening) => {
    if (opening.kind !== 'ready') throw new Error('expected ready')
    return opening
  }

  it('ends Load more cleanly at the window when yesterday has no manifest (404)', async () => {
    const { history } = stubHistory({ slots: [10, 11, 12, 13, 14, 15, 16], yesterdaySlots: [-1] })
    const missing: TimelineHistory = {
      ...history,
      manifest: async (path) => {
        if (path.includes('10-03')) throw new ApiError('Not found', 404)
        return history.manifest(path)
      },
    }
    const opened = ready(await sourceOf(missing).open('nfl'))
    const more = ready(await opened.loadMore!())
    expect(more.range.reach).toBe('window')
    expect(more.loadMore).toBeUndefined()
    expect(more.range.loaded).toBe(7)
  })

  it('still rejects, retryably, for a real error reading yesterday', async () => {
    const { history } = stubHistory({ slots: [10, 11, 12, 13, 14, 15, 16], yesterdaySlots: [-1] })
    const broken: TimelineHistory = {
      ...history,
      manifest: async (path) => {
        if (path.includes('10-03')) throw new ApiError('Server error', 500)
        return history.manifest(path)
      },
    }
    const opened = ready(await sourceOf(broken).open('nfl'))
    await expect(opened.loadMore!()).rejects.toThrow('Server error')
    expect(opened.loadMore).toBeDefined()
  })
})

describe('the completed flag', () => {
  it('is set when the newest snapshot shows a completed contest, and follows a refresh', async () => {
    const done = (snapshot: { sports: { nfl: { contests: Array<{ state: string }> } } }) => {
      snapshot.sports.nfl.contests[0].state = 'completed'
    }
    const { history, publish } = stubHistory({ mutate: { 7: done } })
    const opened = await sourceOf(history).open('nfl')
    if (opened.kind !== 'ready' || !opened.refresh) throw new Error('expected a refreshable opening')
    expect(opened.completed).toBe(false)
    publish(7)
    const refreshed = await opened.refresh()
    if (refreshed.kind !== 'ready') throw new Error('expected ready')
    expect(refreshed.completed).toBe(true)
  })
})

describe('older snapshots that cannot be shown', () => {
  it('become gaps with no retry when the snapshot is not renderable', async () => {
    const { history, calls } = stubHistory({ mutate: { 4: (snapshot) => delete snapshot.sports.nfl.primary_contest } })
    const opened = await sourceOf(history).open('nfl')
    if (opened.kind !== 'ready' || !opened.retryGap) throw new Error('expected a retryable opening')
    expect(opened.timeline.entries[2]).toMatchObject({ kind: 'gap', reason: 'not-renderable', snapshotAt: stamp(4) })
    calls.snapshots.length = 0
    expect(await opened.retryGap(stamp(4))).toBe(opened)
    expect(calls.snapshots).toEqual([])
  })
})

describe('Load more across the UTC midnight', () => {
  it('reads the yesterday that the latest pointer names now, not the one named when the Timeline opened', async () => {
    const { history, calls } = stubHistory({
      slots: [10, 11, 12, 13, 14, 15, 16],
      yesterdaySlots: Array.from({ length: 20 }, (_, i) => i - 20),
    })
    let rolled = false
    const midnight: TimelineHistory = {
      ...history,
      latest: async () => ({
        ...(await history.latest()),
        manifest_yesterday_path: rolled ? 'manifest/2026-10-03.json' : 'manifest/2026-10-02.json',
      }),
      manifest: async (path) => {
        if (path.includes('10-02')) throw new Error('the old yesterday is the wrong day')
        return history.manifest(path)
      },
    }
    const opened = await sourceOf(midnight).open('nfl')
    if (opened.kind !== 'ready' || !opened.loadMore) throw new Error('expected a loadable opening')
    rolled = true
    const more = await opened.loadMore()
    if (more.kind !== 'ready') throw new Error('expected ready')
    expect(calls.manifests).toContain('manifest/2026-10-03.json')
    expect(more.timeline.entries.map((entry) => entry.snapshotAt)).toContain(stamp(-1))
  })
})
