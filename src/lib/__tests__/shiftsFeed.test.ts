import { describe, expect, it } from 'vitest'
import {
  modelOf,
  memoryStorage,
  T0,
  feedOver,
  expectQuiet,
  nflModel,
  KEY,
  seededFeed,
  vipItems,
  INSIDE,
} from './shiftsTestKit'
import { createShiftsFeed, type ShiftsStorage } from '../shifts'

/* eslint-disable @typescript-eslint/no-explicit-any */
function otherSlate(snapshot: any) {
  snapshot.sports.cfb.contests[0].name = 'Tomorrow Slate'
  snapshot.sports.cfb.contests[0].start_time = '2099-01-01T00:00:00Z'
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const throwingStorage: ShiftsStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function withoutVip(name: string) {
  return (snapshot: any) => {
    const contest = snapshot.sports.nfl.contests[0]
    contest.vip_lineups = contest.vip_lineups.filter((vip: any) => vip.display_name !== name)
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('first build', () => {
  it('seeds from the Live model and returns an empty feed', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    expectQuiet(feed)
  })

  it('stays empty on later builds of the same contest', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    feed.record(modelOf('cfb'), { visit: false })
    expectQuiet(feed)
  })
})

describe('switching', () => {
  it('seeds clean for a different primary contest and drops the old contest state', () => {
    const storage = memoryStorage()
    const feed = feedOver(storage)
    const oldModel = modelOf('cfb')
    feed.record(oldModel, { visit: true })
    feed.record(modelOf('cfb', otherSlate), { visit: true })
    expectQuiet(feed)
    const stored = [...storage.data.values()].join('')
    expect(stored).toContain('Tomorrow Slate')
    expect(stored).not.toContain(oldModel.contest.name)
  })

  it('seeds clean for a different sport', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    feed.record(modelOf('mlb'), { visit: true })
    expectQuiet(feed)
  })

  it('keeps separate stored state per sport', () => {
    const storage = memoryStorage()
    const feed = feedOver(storage)
    feed.record(modelOf('cfb'), { visit: true })
    expect(storage.data.size).toBe(1)
    const [[cfbKey, cfbValue]] = [...storage.data.entries()]
    feed.record(modelOf('mlb'), { visit: true })
    expect(storage.data.size).toBe(2)
    expect(storage.data.get(cfbKey)).toBe(cfbValue)
  })
})

describe('unusable storage', () => {
  it('leaves the feed empty when storage is missing', () => {
    const feed = feedOver(null)
    expect(() => feed.record(modelOf('cfb'), { visit: true })).not.toThrow()
    expectQuiet(feed)
  })

  it('leaves the feed empty when storage throws', () => {
    const feed = feedOver(throwingStorage)
    expect(() => feed.record(modelOf('cfb'), { visit: true })).not.toThrow()
    expect(() => feed.markSeen()).not.toThrow()
    expect(() => feed.markSurfaced(['x'])).not.toThrow()
    expectQuiet(feed)
  })

  it.each(['{not json', '"a string"', 'null', '{"contest":42}', '[]'])(
    'recovers from corrupt stored value %s',
    (corrupt) => {
      const probe = memoryStorage()
      feedOver(probe).record(modelOf('cfb'), { visit: true })
      const [key] = [...probe.data.keys()]
      const storage = memoryStorage({ [key]: corrupt })
      const feed = feedOver(storage)
      expect(() => feed.record(modelOf('cfb'), { visit: true })).not.toThrow()
      expectQuiet(feed)
      expect(() => JSON.parse(storage.data.get(key) ?? '')).not.toThrow()
    },
  )
})

describe('acknowledging', () => {
  it('markSurfaced and markSeen change nothing on a seeded feed', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    expect(() => feed.markSurfaced(['missing'])).not.toThrow()
    expect(() => feed.markSeen()).not.toThrow()
    expectQuiet(feed)
  })
})

describe('net VIP shifts', () => {
  it('reports a VIP rank, points and distance move as from/to pairs', () => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(nflModel({ EmpireMaker2: { rank: 480, pts: 33.5, distancePoints: -1.5, distanceRank: -20 } }), {
      visit: false,
    })
    const [item] = vipItems(feed)
    expect(vipItems(feed)).toHaveLength(1)
    expect(item).toMatchObject({
      kind: 'vip',
      vipKey: KEY.empire,
      priority: 'normal',
      detectedAt: T0 + 60_000,
      rank: { from: 511, to: 480 },
      points: { from: 30.939999, to: 33.5 },
      distanceToCashPoints: { from: -0.3, to: -1.5 },
      distanceToCashRank: { from: -11, to: -20 },
    })
    expect(typeof item.id).toBe('string')
    expect(feed.unseenCount()).toBe(1)
  })

  it.each([
    ['rank', { rank: 512 }],
    ['points', { pts: 31.9 }],
    ['distance to cash', { distancePoints: -0.6, distanceRank: -10 }],
  ])('ignores a %s move below its threshold', (_label, change) => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: change }), { visit: false })
    expect(feed.feed()).toEqual([])
    expect(feed.unseenCount()).toBe(0)
  })

  it.each([
    ['rank', { rank: 513 }],
    ['points', { pts: 31.94 }],
    ['distance to cash in points', { distancePoints: 0.7 }],
    ['distance to cash in ranks', { distanceRank: -9 }],
  ])('reports a %s move that exactly meets its threshold', (_label, change) => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: change }), { visit: false })
    expect(vipItems(feed)).toHaveLength(1)
  })

  it('measures from the Seen mark, so moves accumulate across polls and a return to the Seen mark vanishes', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { rank: 510 } }), { visit: false })
    expect(feed.feed()).toEqual([])
    feed.record(nflModel({ EmpireMaker2: { rank: 508 } }), { visit: false })
    expect(vipItems(feed)[0].rank).toEqual({ from: 511, to: 508 })
    feed.record(nflModel(), { visit: false })
    expect(feed.feed()).toEqual([])
  })

  it('orders items by the largest absolute rank move, with one item per VIP', () => {
    const { feed } = seededFeed()
    feed.record(
      nflModel({
        EmpireMaker2: { rank: 505, pts: 40 },
        Cubbiesftw23: { rank: 1100 },
        tuck8989: { rank: 800 },
      }),
      { visit: false },
    )
    expect(vipItems(feed).map((item) => item.vipKey)).toEqual([KEY.cubbies, KEY.tuck, KEY.empire])
    expect(feed.unseenCount()).toBe(3)
  })

  it('ignores a VIP that appears only in the current model', () => {
    const { feed } = seededFeed()
    feed.record(
      nflModel({ EmpireMaker2: { rank: 400 } }, (snapshot) => {
        const contest = snapshot.sports.nfl.contests[0]
        contest.vip_lineups.push({
          ...structuredClone(contest.vip_lineups[0]),
          entry_key: 'new-1',
          vip_entry_key: 'new-1',
          display_name: 'NewVip',
        })
      }),
      { visit: false },
    )
    expect(vipItems(feed).map((item) => item.vipKey)).toEqual([KEY.empire])
  })

  it('ignores a VIP that is missing from the current model', () => {
    const { feed } = seededFeed()
    feed.record(
      nflModel({}, (snapshot) => {
        const contest = snapshot.sports.nfl.contests[0]
        contest.vip_lineups = contest.vip_lineups.filter(
          (vip: { display_name: string }) => vip.display_name !== 'EmpireMaker2',
        )
      }),
      { visit: false },
    )
    expect(feed.feed()).toEqual([])
    expect(feed.unseenCount()).toBe(0)
  })

  it('keeps the Seen mark across feed instances over the same storage', () => {
    const storage = memoryStorage()
    createShiftsFeed({ storage, now: () => T0 }).record(nflModel(), { visit: true })
    const later = createShiftsFeed({ storage, now: () => T0 + 60_000 })
    later.record(nflModel({ EmpireMaker2: { rank: 400 } }), { visit: false })
    expect(vipItems(later).map((item) => item.vipKey)).toEqual([KEY.empire])
  })

  it('gives each item an id that is stable across polls', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { rank: 400 } }), { visit: false })
    const first = feed.feed()[0].id
    feed.record(nflModel({ EmpireMaker2: { rank: 390 } }), { visit: false })
    expect(feed.feed()[0].id).toBe(first)
  })
})

describe('a VIP added or removed mid-session', () => {
  it('baselines the VIP at its first appearance, quietly, then reports its later moves', () => {
    const storage = memoryStorage()
    const first = createShiftsFeed({ storage, now: () => T0 })
    first.record(nflModel({}, withoutVip('Cubbiesftw23')), { visit: true })
    const later = createShiftsFeed({ storage, now: () => T0 + 60_000 })
    later.record(nflModel(), { visit: false })
    expectQuiet(later)
    later.record(nflModel({ Cubbiesftw23: { rank: 1000 } }), { visit: false })
    expect(vipItems(later)).toHaveLength(1)
    expect(vipItems(later)[0]).toMatchObject({ vipKey: KEY.cubbies, rank: { from: 1014, to: 1000 } })
  })

  it('reports a cash crossing by a VIP after it was added', () => {
    const storage = memoryStorage()
    createShiftsFeed({ storage, now: () => T0 }).record(nflModel({}, withoutVip('EmpireMaker2')), { visit: true })
    const feed = createShiftsFeed({ storage, now: () => T0 + 60_000 })
    feed.record(nflModel(), { visit: false })
    expectQuiet(feed)
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expect(vipItems(feed)[0]).toMatchObject({ vipKey: KEY.empire, priority: 'high', crossing: { path: 'in' } })
  })

  it('drops a removed VIP quietly and baselines it afresh when it returns', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({}, withoutVip('EmpireMaker2')), { visit: false })
    expectQuiet(feed)
    feed.record(nflModel({ EmpireMaker2: { rank: 400 } }), { visit: false })
    expectQuiet(feed)
    feed.record(nflModel({ EmpireMaker2: { rank: 300 } }), { visit: false })
    expect(vipItems(feed)[0]).toMatchObject({ rank: { from: 400, to: 300 } })
  })
})

describe('subscribing to the feed', () => {
  it('notifies a subscriber after a build is recorded, with the feed already updated', () => {
    const { feed } = seededFeed()
    const seenCounts: number[] = []
    feed.subscribe(() => seenCounts.push(feed.unseenCount()))
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    expect(seenCounts).toEqual([1])
  })

  it('notifies a subscriber after the feed is marked seen, with the feed already empty', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    const seenCounts: number[] = []
    feed.subscribe(() => seenCounts.push(feed.unseenCount()))
    feed.markSeen()
    expect(seenCounts).toEqual([0])
  })

  it('notifies a subscriber after items are marked surfaced, with the items already surfaced', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    const unsurfaced: number[] = []
    feed.subscribe(() => unsurfaced.push(feed.unsurfaced().length))
    feed.markSurfaced([feed.feed()[0].id])
    expect(unsurfaced).toEqual([0])
  })

  it('stops notifying once unsubscribed', () => {
    const { feed } = seededFeed()
    let calls = 0
    const unsubscribe = feed.subscribe(() => calls++)
    unsubscribe()
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }), { visit: false })
    expect(calls).toBe(0)
  })
})
