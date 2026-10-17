import { describe, expect, it } from 'vitest'
import { TIMELINE_FETCH_BOUND, TIMELINE_OPEN_SNAPSHOTS } from '../timelineConfig'
import { createTimelineSource, type TimelineHistory } from '../timelineSource'
import { pathOf, stamp, stubHistory } from '../../test/timelineHistory'
import type { VipShiftItem } from '../shifts'

const noYield = async () => {}
const sourceOf = (history: TimelineHistory, extra: Partial<Parameters<typeof createTimelineSource>[0]> = {}) =>
  createTimelineSource({ history, now: () => 1_000, yieldToMain: noYield, ...extra })

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
    const vips = opened.timeline.entries[0].kind === 'step' ? opened.timeline.entries[0].items.filter((item): item is VipShiftItem => item.kind === 'vip') : []
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
    const vip = across.kind === 'step' ? across.items.find((item): item is VipShiftItem => item.kind === 'vip' && item.rank.to === 550) : undefined
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
      expect(opened.timeline.rangeNote).toEqual({ kind: 'from', snapshotAt: stamp(4) })
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
})
