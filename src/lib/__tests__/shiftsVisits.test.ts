import { describe, expect, it } from 'vitest'
import {
  modelOf,
  memoryStorage,
  T0,
  expectQuiet,
  nflModel,
  KEY,
  seededFeed,
  vipItems,
  INSIDE,
  MINUTE,
} from './shiftsTestKit'
import { createShiftsFeed } from '../shifts'

/** A feed seeded at T0 whose VIP then moved at T0 + 1 min (a poll), leaving one unseen item. */
function feedWithUnseen() {
  const { feed, at } = seededFeed()
  at(T0 + MINUTE)
  feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
  return { feed, at }
}

describe('visits after a short absence', () => {
  it('advances the Seen mark silently, leaving nothing unseen and no summary', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 1 * MINUTE + 9 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expectQuiet(feed)
  })

  it('measures later moves from the advanced Seen mark', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 5 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    at(T0 + 6 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 470 } }), { visit: false })
    expect(vipItems(feed)[0].rank).toEqual({ from: 480, to: 470 })
  })

  it('also acknowledges a cash crossing, clearing the High priority items', () => {
    const { feed, at } = seededFeed()
    at(T0 + MINUTE)
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expect(feed.unsurfaced()).toHaveLength(1)
    at(T0 + 2 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: true })
    expectQuiet(feed)
  })
})

describe('the Seen mark moving on by itself', () => {
  it('is reported after a visit that auto-advanced it, and stays through polls', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 5 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.autoAdvanced()).toBe(true)
    at(T0 + 10 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    expect(feed.autoAdvanced()).toBe(true)
  })

  it('is not reported on the first build or after a visit that left shifts accumulating', () => {
    const { feed, at } = seededFeed()
    expect(feed.autoAdvanced()).toBe(false)
    at(T0 + 20 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.autoAdvanced()).toBe(false)
  })

  it('is cleared by marking as seen and by the next visit', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 5 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    feed.markSeen()
    expect(feed.autoAdvanced()).toBe(false)
    at(T0 + 10 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.autoAdvanced()).toBe(true)
    at(T0 + 50 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.autoAdvanced()).toBe(false)
  })
})

describe('visits after a middling absence', () => {
  it('lets shifts accumulate as unseen, with no summary', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + MINUTE + 10 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 470 } }), { visit: true })
    expect(vipItems(feed)[0].rank).toEqual({ from: 511, to: 470 })
    expect(feed.unseenCount()).toBe(1)
    expect(feed.awaySummary()).toBeNull()
  })

  it('still accumulates just under the summary duration', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + MINUTE + 29 * MINUTE + 59_000)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.unseenCount()).toBe(1)
    expect(feed.awaySummary()).toBeNull()
  })
})

describe('visits after a long absence', () => {
  it('sets the flag with the unseen count, top item and minutes away', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + MINUTE + 30 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 }, Cubbiesftw23: { rank: 1100 } }), { visit: true })
    expect(feed.awaySummary()).toEqual({ unseenCount: 2, topItem: feed.feed()[0], minutesAway: 30 })
    expect(feed.awaySummary()?.topItem).toMatchObject({ vipKey: KEY.cubbies })
    expect(feed.unseenCount()).toBe(2)
  })

  it('measures the absence from the previous build, not from the Seen mark', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 3 * 60 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.awaySummary()?.minutesAway).toBe(179)
  })

  it('leaves the flag unset when nothing is unseen', () => {
    const { feed, at } = seededFeed()
    at(T0 + 45 * MINUTE)
    feed.record(nflModel(), { visit: true })
    expectQuiet(feed)
  })

  it('does not advance the Seen mark', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 40 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    at(T0 + 41 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    expect(vipItems(feed)[0].rank).toEqual({ from: 511, to: 480 })
  })

  it('keeps the flag through polls and recomputes it on the next visit', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 40 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    at(T0 + 41 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    expect(feed.awaySummary()).toMatchObject({ unseenCount: 1, minutesAway: 39 })
    at(T0 + 42 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.awaySummary()).toBeNull()
  })

  it('drops the flag when the feed moves to another sport, since it described the first', () => {
    let clock = T0
    const feed = createShiftsFeed({ storage: memoryStorage(), now: () => clock })
    feed.record(modelOf('cfb'), { visit: true })
    feed.record(nflModel(), { visit: true })
    clock = T0 + 40 * MINUTE
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(feed.awaySummary()).not.toBeNull()
    feed.record(modelOf('cfb'), { visit: false })
    expect(feed.awaySummary()).toBeNull()
  })

  it('reads the previous build from stored state, so a fresh feed instance sees the absence', () => {
    const storage = memoryStorage()
    createShiftsFeed({ storage, now: () => T0 }).record(nflModel(), { visit: true })
    const later = createShiftsFeed({ storage, now: () => T0 + 2 * 60 * MINUTE })
    later.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    expect(later.awaySummary()).toMatchObject({ unseenCount: 1, minutesAway: 120 })
  })
})

describe('polls while the tab stays visible', () => {
  it('never advance the Seen mark, however long the absence', () => {
    const { feed, at } = feedWithUnseen()
    for (const minutes of [5, 20, 60, 600]) {
      at(T0 + minutes * MINUTE)
      feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
      expect(feed.unseenCount()).toBe(1)
      expect(feed.awaySummary()).toBeNull()
    }
  })
})

describe('marking as seen', () => {
  it('advances the Seen mark to now, so the feed empties and later moves measure from here', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 2 * MINUTE)
    feed.markSeen()
    expectQuiet(feed)
    at(T0 + 3 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 470 } }), { visit: false })
    expect(vipItems(feed)[0].rank).toEqual({ from: 480, to: 470 })
  })

  it('clears the High priority log, but a surfaced item stays listed until then', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    feed.markSurfaced([feed.feed()[0].id])
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expect(feed.feed()).toHaveLength(1)
    feed.markSeen()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expectQuiet(feed)
  })

  it('persists across feed instances', () => {
    const storage = memoryStorage()
    const first = createShiftsFeed({ storage, now: () => T0 })
    first.record(nflModel(), { visit: true })
    first.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    first.markSeen()
    const second = createShiftsFeed({ storage, now: () => T0 + MINUTE })
    second.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    expectQuiet(second)
  })

  it('clears the away summary', () => {
    const { feed, at } = feedWithUnseen()
    at(T0 + 40 * MINUTE)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: true })
    feed.markSeen()
    expect(feed.awaySummary()).toBeNull()
  })
})

describe('items left unsurfaced', () => {
  it('are exposed again on the next load, and reading the outputs never surfaces them', () => {
    const storage = memoryStorage()
    const first = createShiftsFeed({ storage, now: () => T0 })
    first.record(nflModel(), { visit: true })
    first.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    first.unsurfaced()
    first.feed()
    expect(first.unsurfaced()).toHaveLength(1)
    const reloaded = createShiftsFeed({ storage, now: () => T0 + 15 * MINUTE })
    reloaded.record(nflModel({ EmpireMaker2: INSIDE }), { visit: true })
    expect(reloaded.unsurfaced()).toHaveLength(1)
  })
})

describe("the Seen mark's snapshot time", () => {
  const SEEN_AT = '2026-10-04T18:41:34Z'
  const LATER_AT = '2026-10-04T18:46:34Z'

  it('is null before the feed has been recorded', () => {
    expect(createShiftsFeed({ storage: memoryStorage(), now: () => T0 }).seenSnapshotAt()).toBeNull()
  })

  it('is the snapshot time of the build the Seen mark was seeded from', () => {
    const { feed } = seededFeed()
    expect(feed.seenSnapshotAt()).toBe(SEEN_AT)
  })

  it('stays put on a later build and moves to the newest build when marked seen', () => {
    const { feed } = seededFeed()
    feed.record(
      nflModel({}, (snapshot) => (snapshot.snapshot_at = LATER_AT)),
      { visit: false },
    )
    expect(feed.seenSnapshotAt()).toBe(SEEN_AT)
    feed.markSeen()
    expect(feed.seenSnapshotAt()).toBe(LATER_AT)
  })

  it('moves when a quick visit advances the Seen mark on its own', () => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(
      nflModel({}, (snapshot) => (snapshot.snapshot_at = LATER_AT)),
      { visit: true },
    )
    expect(feed.seenSnapshotAt()).toBe(LATER_AT)
  })

  it('is read-only: reading it writes nothing to storage', () => {
    const storage = memoryStorage()
    const feed = createShiftsFeed({ storage, now: () => T0 })
    feed.record(nflModel(), { visit: true })
    const before = [...storage.data.entries()]
    feed.seenSnapshotAt()
    feed.seenSnapshotAt()
    expect([...storage.data.entries()]).toEqual(before)
  })

  it('notifies subscribers when the Seen mark moves', () => {
    const { feed } = seededFeed()
    let notified = 0
    feed.subscribe(() => notified++)
    feed.markSeen()
    expect(notified).toBe(1)
  })
})
