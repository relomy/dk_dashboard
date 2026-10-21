import { describe, expect, it } from 'vitest'
import { TIMELINE_CAP } from '../timelineConfig'
import { createTimelineSource, type TimelineHistory, type TimelineOpening } from '../timelineSource'
import { pathOf, stamp, stubHistory } from '../../test/timelineHistory'
import { sourceOf } from './timelineSourceTestKit'

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
