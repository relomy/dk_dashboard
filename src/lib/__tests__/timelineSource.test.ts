import { describe, expect, it } from 'vitest'
import {
  TIMELINE_CAP,
  TIMELINE_FETCH_BOUND,
  TIMELINE_LOAD_MORE_SNAPSHOTS,
  TIMELINE_OPEN_SNAPSHOTS,
} from '../timelineConfig'
import { ApiError } from '../api'
import { createLimiter, createTimelineSource, type TimelineHistory } from '../timelineSource'
import { pathOf, stamp, stubHistory } from '../../test/timelineHistory'
import type { TimelineOpening } from '../timelineSource'
import type { VipShiftItem } from '../shifts'

const noYield = async () => {}
const sourceOf = (history: TimelineHistory, extra: Partial<Parameters<typeof createTimelineSource>[0]> = {}) =>
  createTimelineSource({ history, now: () => 1_000, yieldToMain: noYield, ...extra })

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

describe('the Timeline source', () => {
  it('opens on the newest snapshots, giving one fewer Step, newest first with snapshot times', async () => {
    const { history, calls } = stubHistory()
    const opened = await sourceOf(history).open('nfl')
    if (opened.kind !== 'ready') throw new Error('expected ready')
    expect(TIMELINE_OPEN_SNAPSHOTS).toBe(5)
    expect(calls.snapshots.sort()).toEqual([2, 3, 4, 5, 6].map(pathOf))
    expect(opened.timeline.entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual(
      [6, 5, 4, 3].map((slot) => ['step', stamp(slot)]),
    )
    const vips =
      opened.timeline.entries[0].kind === 'step'
        ? opened.timeline.entries[0].items.filter((item): item is VipShiftItem => item.kind === 'vip')
        : []
    const moved = vips.find((vip) => vip.rank.to === 540)
    expect(moved?.rank).toEqual({ from: 550, to: 540 })
    expect(moved?.points).toEqual({ from: 55, to: 60 })
  })

  it('never has more snapshot fetches in flight than the bound', async () => {
    const { history, calls } = stubHistory()
    await sourceOf(history, { fetchBound: 2 }).open('nfl')
    expect(calls.maxInFlight).toBe(2)
    const wide = stubHistory()
    await sourceOf(wide.history).open('nfl')
    expect(wide.calls.maxInFlight).toBeLessThanOrEqual(TIMELINE_FETCH_BOUND)
    expect(wide.calls.maxInFlight).toBeGreaterThan(1)
  })

  it('skips a not-fresh snapshot without downloading it and leaves a gap without retry', async () => {
    const { history, calls } = stubHistory({ stale: [4] })
    const opened = await sourceOf(history).open('nfl')
    if (opened.kind !== 'ready') throw new Error('expected ready')
    expect(calls.snapshots).not.toContain(pathOf(4))
    expect(opened.timeline.entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual([
      ['step', stamp(6)],
      ['step', stamp(5)],
      ['gap', stamp(4)],
      ['step', stamp(3)],
    ])
    expect(opened.timeline.entries[2]).toMatchObject({ kind: 'gap', reason: 'not-fresh' })
  })

  it('turns a failed older snapshot into an unavailable gap and compares the neighbours across it', async () => {
    const { history } = stubHistory({ failing: [4] })
    const opened = await sourceOf(history).open('nfl')
    if (opened.kind !== 'ready') throw new Error('expected ready')
    expect(opened.timeline.entries[2]).toMatchObject({ kind: 'gap', reason: 'unavailable' })
    const across = opened.timeline.entries[1]
    const vip =
      across.kind === 'step'
        ? across.items.find((item): item is VipShiftItem => item.kind === 'vip' && item.rank.to === 550)
        : undefined
    expect(vip?.rank).toEqual({ from: 570, to: 550 })
  })

  it('rejects when the manifest cannot be read', async () => {
    const { history } = stubHistory({ manifestError: true })
    await expect(sourceOf(history).open('nfl')).rejects.toThrow('manifest down')
  })

  it('rejects when the latest snapshot cannot be read', async () => {
    const { history } = stubHistory({ failing: [6] })
    await expect(sourceOf(history).open('nfl')).rejects.toThrow('snapshot 6 down')
  })

  it('reports not-renderable when the sport has no primary contest in the latest snapshot', async () => {
    const { history } = stubHistory({ mutate: { 6: (snapshot) => delete snapshot.sports.nfl.primary_contest } })
    const opened = await sourceOf(history).open('nfl')
    expect(opened.kind).toBe('not-renderable')
  })

  it('reports progress as each snapshot settles', async () => {
    const { history } = stubHistory()
    const progress: Array<[number, number]> = []
    await sourceOf(history).open('nfl', { onProgress: (done, total) => progress.push([done, total]) })
    expect(progress).toEqual([1, 2, 3, 4, 5].map((done) => [done, 5]))
  })

  it('tops a short day up from yesterday and ignores a yesterday that fails', async () => {
    const { history } = stubHistory({ slots: [5, 6] })
    const withYesterday: TimelineHistory = {
      ...history,
      latest: async () => ({ ...(await history.latest()), manifest_yesterday_path: 'manifest/2026-10-03.json' }),
      manifest: async (path) => {
        if (path.includes('10-03')) throw new Error('no yesterday')
        return history.manifest(path)
      },
    }
    const opened = await sourceOf(withYesterday).open('nfl')
    if (opened.kind !== 'ready') throw new Error('expected ready')
    expect(opened.timeline.entries).toHaveLength(1)
  })

  describe('contest rotation', () => {
    const rotated = (snapshot: { sports: { nfl: { contests: Array<{ name: string }> } } }) => {
      snapshot.sports.nfl.contests[0].name = 'Yesterday slate'
    }

    it('drops snapshots whose primary contest differs from the latest one and starts a fresh Timeline', async () => {
      const { history } = stubHistory({ mutate: { 2: rotated, 3: rotated } })
      const opened = await sourceOf(history).open('nfl')
      if (opened.kind !== 'ready') throw new Error('expected ready')
      expect(opened.timeline.entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual([
        ['step', stamp(6)],
        ['step', stamp(5)],
      ])
      expect(opened.timeline.rangeNote).toEqual({ kind: 'contest-start', snapshotAt: stamp(4) })
    })

    it('does not leave a gap behind the rotation, where no Step could be compared across it', async () => {
      const { history } = stubHistory({ failing: [3], mutate: { 2: rotated } })
      const opened = await sourceOf(history).open('nfl')
      if (opened.kind !== 'ready') throw new Error('expected ready')
      expect(opened.timeline.entries.map((entry) => entry.kind)).toEqual(['step', 'step'])
    })

    it('keeps a gap that sits between snapshots of the current contest', async () => {
      const { history } = stubHistory({ failing: [5], mutate: { 2: rotated, 3: rotated } })
      const opened = await sourceOf(history).open('nfl')
      if (opened.kind !== 'ready') throw new Error('expected ready')
      expect(opened.timeline.entries.map((entry) => entry.kind)).toEqual(['step', 'gap'])
    })
  })

  describe('retrying a gap', () => {
    it('refetches only that snapshot and fills the Step on success', async () => {
      const failing = [4]
      const { history, calls } = stubHistory({ failing })
      const opened = await sourceOf(history).open('nfl')
      if (opened.kind !== 'ready' || !opened.retryGap) throw new Error('expected a retryable opening')
      failing.length = 0
      calls.snapshots.length = 0
      const retried = await opened.retryGap(stamp(4))
      expect(calls.snapshots).toEqual([pathOf(4)])
      if (retried.kind !== 'ready') throw new Error('expected ready')
      expect(retried.timeline.entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual(
        [6, 5, 4, 3].map((slot) => ['step', stamp(slot)]),
      )
    })

    it('leaves the gap, and a further retry, when the snapshot fails again', async () => {
      const { history } = stubHistory({ failing: [4] })
      const opened = await sourceOf(history).open('nfl')
      if (opened.kind !== 'ready' || !opened.retryGap) throw new Error('expected a retryable opening')
      const retried = await opened.retryGap(stamp(4))
      if (retried.kind !== 'ready' || !retried.retryGap) throw new Error('expected a retryable opening')
      expect(retried.timeline.entries[2]).toMatchObject({ kind: 'gap', reason: 'unavailable' })
    })

    it('offers no retry for a not-fresh gap', async () => {
      const { history, calls } = stubHistory({ stale: [4] })
      const opened = await sourceOf(history).open('nfl')
      if (opened.kind !== 'ready' || !opened.retryGap) throw new Error('expected a retryable opening')
      calls.snapshots.length = 0
      const retried = await opened.retryGap(stamp(4))
      expect(calls.snapshots).toEqual([])
      expect(retried).toBe(opened)
    })

    it('drops a retried snapshot that belongs to another contest', async () => {
      const failing = [4]
      const other = (snapshot: { sports: { nfl: { contests: Array<{ name: string }> } } }) => {
        snapshot.sports.nfl.contests[0].name = 'Yesterday slate'
      }
      const { history } = stubHistory({ failing, mutate: { 4: other } })
      const opened = await sourceOf(history).open('nfl')
      if (opened.kind !== 'ready' || !opened.retryGap) throw new Error('expected a retryable opening')
      failing.length = 0
      const retried = await opened.retryGap(stamp(4))
      if (retried.kind !== 'ready') throw new Error('expected ready')
      expect(retried.timeline.entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual(
        [6, 5, 3].map((slot) => ['step', stamp(slot)]),
      )
    })
  })

  describe('loading more', () => {
    const ready = (opening: TimelineOpening) => {
      if (opening.kind !== 'ready') throw new Error('expected ready')
      return opening
    }
    const slotsOf = (opening: TimelineOpening) => ready(opening).timeline.entries.map((entry) => entry.snapshotAt)
    const many = Array.from({ length: 40 }, (_, i) => i)

    it('fetches the next 10 snapshots back and adds Steps at the tail, joined to the oldest Step', async () => {
      const { history, calls } = stubHistory({ slots: many })
      const opened = ready(await sourceOf(history).open('nfl'))
      expect(opened.range).toEqual({ loaded: 5, cap: TIMELINE_CAP, reach: null })
      calls.snapshots.length = 0
      const more = ready(await opened.loadMore!())
      expect(TIMELINE_LOAD_MORE_SNAPSHOTS).toBe(10)
      expect(calls.snapshots.sort()).toEqual(Array.from({ length: 10 }, (_, i) => pathOf(25 + i)).sort())
      expect(slotsOf(more)).toEqual(Array.from({ length: 14 }, (_, i) => stamp(39 - i)))
      expect(more.range).toEqual({ loaded: 15, cap: TIMELINE_CAP, reach: null })
    })

    it('keeps the fetches in flight within the bound and reports progress', async () => {
      const { history, calls } = stubHistory({ slots: many })
      const opened = ready(await sourceOf(history, { fetchBound: 3 }).open('nfl'))
      calls.maxInFlight = 0
      const progress: Array<[number, number]> = []
      await opened.loadMore!({ onProgress: (done, total) => progress.push([done, total]) })
      expect(calls.maxInFlight).toBe(3)
      expect(progress).toHaveLength(10)
      expect(progress[9]).toEqual([10, 10])
    })

    it('can load again from the result, and a gap in the new page keeps its retry', async () => {
      const { history } = stubHistory({ slots: many, failing: [30] })
      const opened = ready(await sourceOf(history).open('nfl'))
      const more = ready(await opened.loadMore!())
      expect(more.timeline.entries.find((entry) => entry.snapshotAt === stamp(30))).toMatchObject({
        kind: 'gap',
        reason: 'unavailable',
      })
      const again = ready(await more.loadMore!())
      expect(again.range.loaded).toBe(25)
      expect(again.retryGap).toBeDefined()
    })

    it('counts not-fresh snapshots in the page and toward the cap without downloading them', async () => {
      const { history, calls } = stubHistory({ slots: many, stale: [27, 28] })
      const opened = ready(await sourceOf(history).open('nfl'))
      calls.snapshots.length = 0
      const more = ready(await opened.loadMore!())
      expect(calls.snapshots).toHaveLength(8)
      expect(more.range.loaded).toBe(15)
    })

    describe('where it stops', () => {
      it('stops at the end of the loaded manifest window, with no Load more', async () => {
        const { history } = stubHistory({ slots: Array.from({ length: 12 }, (_, i) => i) })
        const opened = ready(await sourceOf(history).open('nfl'))
        const more = ready(await opened.loadMore!())
        expect(more.range).toEqual({ loaded: 12, cap: TIMELINE_CAP, reach: 'window' })
        expect(more.loadMore).toBeUndefined()
        expect(more.timeline.rangeNote).toEqual({ kind: 'from', snapshotAt: stamp(0) })
      })

      it('stops at the window already at open when the day is short and offers no Load more', async () => {
        const { history } = stubHistory({ slots: [4, 5, 6] })
        const opened = ready(await sourceOf(history).open('nfl'))
        expect(opened.range.reach).toBe('window')
        expect(opened.loadMore).toBeUndefined()
      })

      it('stops at the contest start, the first loaded snapshot of the current contest, with its own note', async () => {
        const rotated = (snapshot: { sports: { nfl: { contests: Array<{ name: string }> } } }) => {
          snapshot.sports.nfl.contests[0].name = 'Yesterday slate'
        }
        const before = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, rotated]))
        const { history } = stubHistory({ slots: many, mutate: before })
        const opened = ready(await sourceOf(history).open('nfl'))
        const more = ready(await opened.loadMore!())
        expect(more.range.reach).toBe('contest-start')
        expect(more.loadMore).toBeUndefined()
        expect(more.timeline.rangeNote).toEqual({ kind: 'contest-start', snapshotAt: stamp(30) })
        expect(slotsOf(more).at(-1)).toBe(stamp(31))
      })

      it('stops at the cap, clamping the last page, with its own note', async () => {
        const { history, calls } = stubHistory({ slots: Array.from({ length: 100 }, (_, i) => i) })
        let opened = ready(await sourceOf(history).open('nfl'))
        while (opened.loadMore) opened = ready(await opened.loadMore())
        expect(opened.range).toEqual({ loaded: TIMELINE_CAP, cap: TIMELINE_CAP, reach: 'cap' })
        expect(calls.snapshots).toHaveLength(TIMELINE_CAP)
        expect(opened.timeline.rangeNote).toEqual({ kind: 'cap', snapshotAt: stamp(100 - TIMELINE_CAP) })
      })

      it('counts not-fresh snapshots toward the cap', async () => {
        const slots = Array.from({ length: 100 }, (_, i) => i)
        const { history, calls } = stubHistory({ slots, stale: slots.slice(40, 70) })
        let opened = ready(await sourceOf(history).open('nfl'))
        while (opened.loadMore) opened = ready(await opened.loadMore())
        expect(opened.range.reach).toBe('cap')
        expect(opened.range.loaded).toBe(TIMELINE_CAP)
        expect(calls.snapshots.length).toBeLessThan(TIMELINE_CAP)
      })

      it('prefers the contest start over the cap when both are reached', async () => {
        const rotated = (snapshot: { sports: { nfl: { contests: Array<{ name: string }> } } }) => {
          snapshot.sports.nfl.contests[0].name = 'Yesterday slate'
        }
        const { history } = stubHistory({
          slots: many,
          mutate: Object.fromEntries([25, 26, 27, 28, 29].map((i) => [i, rotated])),
        })
        const opened = ready(await sourceOf(history, { cap: 15 }).open('nfl'))
        const more = ready(await opened.loadMore!())
        expect(more.range.reach).toBe('contest-start')
      })
    })

    describe('across the UTC midnight manifest rollover', () => {
      it('reads yesterday only once today runs out, and carries on into it', async () => {
        const { history, calls } = stubHistory({
          slots: [10, 11, 12, 13, 14, 15, 16],
          yesterdaySlots: Array.from({ length: 20 }, (_, i) => i - 20),
        })
        const opened = ready(await sourceOf(history).open('nfl'))
        expect(calls.manifests).toEqual(['manifest/2026-10-04.json'])
        const more = ready(await opened.loadMore!())
        expect(calls.manifests).toContain('manifest/2026-10-03.json')
        expect(more.range).toEqual({ loaded: 15, cap: TIMELINE_CAP, reach: null })
        expect(slotsOf(more)).toContain(stamp(-1))
        expect(slotsOf(more).indexOf(stamp(10))).toBeLessThan(slotsOf(more).indexOf(stamp(-1)))
        expect(slotsOf(more)).toHaveLength(14)
      })

      it('reads yesterday just once and ends at the window when it too is exhausted', async () => {
        const { history, calls } = stubHistory({ slots: [10, 11, 12, 13, 14, 15, 16], yesterdaySlots: [-3, -2, -1] })
        const opened = ready(await sourceOf(history).open('nfl'))
        const more = ready(await opened.loadMore!())
        expect(more.range).toEqual({ loaded: 10, cap: TIMELINE_CAP, reach: 'window' })
        expect(calls.manifests.filter((path) => path.includes('10-03'))).toHaveLength(1)
      })

      it('does not read yesterday again when open already topped up from it', async () => {
        const { history, calls } = stubHistory({
          slots: [5, 6],
          yesterdaySlots: Array.from({ length: 20 }, (_, i) => i - 20),
        })
        const opened = ready(await sourceOf(history).open('nfl'))
        await opened.loadMore!()
        expect(calls.manifests.filter((path) => path.includes('10-03'))).toHaveLength(1)
      })

      it('rejects Load more when yesterday cannot be read, leaving the Timeline as it was', async () => {
        const { history } = stubHistory({
          slots: [10, 11, 12, 13, 14, 15, 16],
          yesterdaySlots: [-1],
          yesterdayError: true,
        })
        const opened = ready(await sourceOf(history).open('nfl'))
        await expect(opened.loadMore!()).rejects.toThrow('yesterday down')
        expect(opened.loadMore).toBeDefined()
      })
    })
  })
})

describe('refreshing an open Timeline', () => {
  const openOf = async (history: TimelineHistory, extra: Partial<Parameters<typeof createTimelineSource>[0]> = {}) => {
    const opened = await sourceOf(history, extra).open('nfl')
    if (opened.kind !== 'ready' || !opened.refresh) throw new Error('expected a refreshable opening')
    return opened
  }

  it('fetches only the snapshots it has not seen and adds their Steps at the top, ids of the old ones unchanged', async () => {
    const { history, calls, publish } = stubHistory()
    const opened = await openOf(history)
    const before = opened.timeline.entries.map((entry) => entry.id)
    calls.snapshots.length = 0
    publish(7)
    const refreshed = await opened.refresh!()
    if (refreshed.kind !== 'ready') throw new Error('expected ready')
    expect(calls.snapshots).toEqual([pathOf(7)])
    expect(refreshed.timeline.entries.map((entry) => entry.snapshotAt)).toEqual([7, 6, 5, 4, 3].map(stamp))
    expect(refreshed.timeline.entries.slice(1).map((entry) => entry.id)).toEqual(before)
  })

  it('returns the same opening and fetches nothing when no snapshot is new', async () => {
    const { history, calls } = stubHistory()
    const opened = await openOf(history)
    calls.snapshots.length = 0
    expect(await opened.refresh!()).toBe(opened)
    expect(calls.snapshots).toEqual([])
  })

  it('refreshes again from the refreshed opening', async () => {
    const { history, calls, publish } = stubHistory()
    const opened = await openOf(history)
    publish(7)
    const first = await opened.refresh!()
    if (first.kind !== 'ready' || !first.refresh) throw new Error('expected a refreshable opening')
    calls.snapshots.length = 0
    publish(8)
    const second = await first.refresh()
    if (second.kind !== 'ready') throw new Error('expected ready')
    expect(calls.snapshots).toEqual([pathOf(8)])
    expect(second.timeline.entries.map((entry) => entry.snapshotAt)).toEqual([8, 7, 6, 5, 4, 3].map(stamp))
  })

  it('counts new arrivals toward the cap, dropping the oldest Steps and saying so in the range note', async () => {
    const { history, publish } = stubHistory()
    const opened = await openOf(history, { cap: 5 })
    publish(7)
    const refreshed = await opened.refresh!()
    if (refreshed.kind !== 'ready') throw new Error('expected ready')
    expect(refreshed.timeline.entries.map((entry) => entry.snapshotAt)).toEqual([7, 6, 5, 4].map(stamp))
    expect(refreshed.timeline.rangeNote).toEqual({ kind: 'cap', snapshotAt: stamp(3) })
  })

  it('shows a new snapshot that fails to load as a gap with retry', async () => {
    const failing = [7]
    const { history, publish } = stubHistory({ failing })
    const opened = await openOf(history)
    publish(7)
    const refreshed = await opened.refresh!()
    if (refreshed.kind !== 'ready' || !refreshed.retryGap) throw new Error('expected a retryable opening')
    expect(refreshed.timeline.entries[0]).toMatchObject({ kind: 'gap', reason: 'unavailable', snapshotAt: stamp(7) })
    failing.length = 0
    const retried = await refreshed.retryGap(stamp(7))
    if (retried.kind !== 'ready') throw new Error('expected ready')
    expect(retried.timeline.entries[0]).toMatchObject({ kind: 'step', snapshotAt: stamp(7) })
  })

  it('skips a new snapshot whose sport is not fresh without downloading it', async () => {
    const { history, calls, publish, manifest } = stubHistory()
    const opened = await openOf(history)
    calls.snapshots.length = 0
    publish(7)
    manifest.snapshots[manifest.snapshots.length - 1].sports_status = { nfl: { status: 'stale', updated_at: stamp(7) } }
    const refreshed = await opened.refresh!()
    if (refreshed.kind !== 'ready') throw new Error('expected ready')
    expect(calls.snapshots).toEqual([])
    expect(refreshed.timeline.entries[0]).toMatchObject({ kind: 'gap', reason: 'not-fresh' })
  })

  it('starts a fresh Timeline when the primary contest rotates', async () => {
    const { history, publish } = stubHistory({
      mutate: {
        7: (snapshot) => {
          snapshot.sports.nfl.contests[0].name = 'Tomorrow slate'
        },
      },
    })
    const opened = await openOf(history)
    publish(7)
    const refreshed = await opened.refresh!()
    if (refreshed.kind !== 'ready') throw new Error('expected ready')
    expect(refreshed.timeline.entries).toEqual([])
    expect(refreshed.timeline.rangeNote).toEqual({ kind: 'contest-start', snapshotAt: stamp(7) })
  })

  it('carries on across the UTC midnight manifest rollover, keeping the built Steps', async () => {
    const { history, calls, publish, manifest } = stubHistory()
    let rolled = false
    const midnight: TimelineHistory = {
      ...history,
      latest: async () => {
        const latest = await history.latest()
        return rolled
          ? {
              ...latest,
              manifest_today_path: 'manifest/2026-10-05.json',
              manifest_yesterday_path: 'manifest/2026-10-04.json',
            }
          : latest
      },
      manifest: async (path) => {
        const all = await history.manifest(path)
        // After midnight, the new day's manifest holds only the newest snapshot and yesterday's holds the rest.
        if (!rolled) return all
        return path.includes('10-05')
          ? { ...all, snapshots: all.snapshots.slice(-1) }
          : { ...all, snapshots: all.snapshots.slice(0, -1) }
      },
    }
    const opened = await openOf(midnight)
    rolled = true
    publish(7)
    calls.snapshots.length = 0
    const refreshed = await opened.refresh!()
    if (refreshed.kind !== 'ready') throw new Error('expected ready')
    expect(calls.snapshots).toEqual([pathOf(7)])
    expect(refreshed.timeline.entries.map((entry) => entry.snapshotAt)).toEqual([7, 6, 5, 4, 3].map(stamp))
    expect(manifest.snapshots).toHaveLength(8)
  })

  it('reads yesterday only when the new day alone cannot show every unseen snapshot', async () => {
    const { history, calls, publish } = stubHistory()
    const opened = await openOf(history)
    publish(7)
    calls.manifests.length = 0
    await opened.refresh!()
    expect(calls.manifests).toEqual(['manifest/2026-10-04.json'])
  })

  describe('with Load more', () => {
    const many = Array.from({ length: 40 }, (_, i) => i)
    const ready = (opening: TimelineOpening) => {
      if (opening.kind !== 'ready') throw new Error('expected ready')
      return opening
    }

    it('keeps the loaded count and Load more after a refresh, and refreshes after Load more', async () => {
      const { history, publish } = stubHistory({ slots: many })
      const opened = ready(await sourceOf(history).open('nfl'))
      const more = ready(await opened.loadMore!())
      expect(more.refresh).toBeDefined()
      publish(40)
      const refreshed = ready(await more.refresh!())
      expect(refreshed.range).toEqual({ loaded: 16, cap: TIMELINE_CAP, reach: null })
      expect(refreshed.timeline.entries).toHaveLength(15)
      expect(refreshed.loadMore).toBeDefined()
      expect(refreshed.retryGap).toBeDefined()
      const again = ready(await refreshed.loadMore!())
      expect(again.range).toEqual({ loaded: 26, cap: TIMELINE_CAP, reach: null })
      expect(again.timeline.entries.map((entry) => entry.snapshotAt)).toEqual(
        Array.from({ length: 25 }, (_, i) => stamp(40 - i)),
      )
      expect(again.refresh).toBeDefined()
    })

    it('stops Load more with the cap reach when a refresh pushes the oldest past the cap', async () => {
      const { history, publish } = stubHistory({ slots: many })
      const opened = ready(await sourceOf(history, { cap: 5 }).open('nfl'))
      expect(opened.range.reach).toBe('cap')
      expect(opened.loadMore).toBeUndefined()
      publish(40)
      const refreshed = ready(await opened.refresh!())
      expect(refreshed.range).toEqual({ loaded: 5, cap: 5, reach: 'cap' })
      expect(refreshed.loadMore).toBeUndefined()
      expect(refreshed.refresh).toBeDefined()
    })

    it('ends Load more at the cap after a refresh used up room', async () => {
      const { history, publish } = stubHistory({ slots: many })
      const opened = ready(await sourceOf(history, { cap: 8 }).open('nfl'))
      publish(40)
      const refreshed = ready(await opened.refresh!())
      expect(refreshed.range).toEqual({ loaded: 6, cap: 8, reach: null })
      const more = ready(await refreshed.loadMore!())
      expect(more.range).toEqual({ loaded: 8, cap: 8, reach: 'cap' })
      expect(more.loadMore).toBeUndefined()
    })
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

describe('refreshing after a long absence', () => {
  it('fetches no more than the cap keeps', async () => {
    const { history, calls, publish } = stubHistory()
    const opened = await sourceOf(history, { cap: 5 }).open('nfl')
    if (opened.kind !== 'ready' || !opened.refresh) throw new Error('expected a refreshable opening')
    for (let slot = 7; slot < 30; slot++) publish(slot)
    calls.snapshots.length = 0
    const refreshed = await opened.refresh()
    if (refreshed.kind !== 'ready') throw new Error('expected ready')
    expect(calls.snapshots).toHaveLength(5)
    expect(refreshed.timeline.entries.map((entry) => entry.snapshotAt)).toEqual([29, 28, 27, 26].map(stamp))
    expect(refreshed.range).toEqual({ loaded: 5, cap: 5, reach: 'cap' })
  })

  it('keeps saying "cap", not "contest start", after the trim drops a leading gap', async () => {
    const { history, publish } = stubHistory({ failing: [3] })
    const opened = await sourceOf(history, { cap: 5 }).open('nfl')
    if (opened.kind !== 'ready' || !opened.refresh) throw new Error('expected a refreshable opening')
    publish(7)
    const first = await opened.refresh()
    if (first.kind !== 'ready' || !first.refresh) throw new Error('expected a refreshable opening')
    expect(first.timeline.entries.map((entry) => entry.snapshotAt)).toEqual([7, 6, 5].map(stamp))
    publish(8)
    const second = await first.refresh()
    if (second.kind !== 'ready') throw new Error('expected ready')
    expect(second.range.reach).toBe('cap')
    expect(second.timeline.rangeNote?.kind).toBe('cap')
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
