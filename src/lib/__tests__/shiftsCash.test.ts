import { describe, expect, it } from 'vitest'
import {
  memoryStorage,
  T0,
  feedOver,
  expectQuiet,
  nflModel,
  KEY,
  seededFeed,
  vipItems,
  LAWRENCE,
  HIGBEE,
  pooled,
  lineupOf,
  cashLine,
  INSIDE,
  OUTSIDE,
  completed,
} from './shiftsTestKit'
import { createShiftsFeed } from '../shifts'

function contestItems(feed: ReturnType<typeof createShiftsFeed>) {
  return feed.feed().filter((item) => item.kind === 'contest-state')
}

describe('cash crossings', () => {
  it('reports a VIP entering cashing as a High item listed ahead of Normal items', () => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(
      nflModel({ EmpireMaker2: { distancePoints: 2.2, distanceRank: -2, rank: 505 }, Cubbiesftw23: { rank: 1100 } }),
      {
        visit: false,
      },
    )
    const items = vipItems(feed)
    expect(items.map((item) => item.vipKey)).toEqual([KEY.empire, KEY.cubbies])
    expect(items[0]).toMatchObject({ priority: 'high', crossing: { path: 'in' } })
    expect(items[1].priority).toBe('normal')
    expect(items[1].crossing).toBeUndefined()
  })

  it('reports a VIP leaving cashing', () => {
    const storage = memoryStorage()
    createShiftsFeed({ storage, now: () => T0 }).record(nflModel({ EmpireMaker2: INSIDE }), { visit: true })
    const feed = createShiftsFeed({ storage, now: () => T0 + 60_000 })
    feed.record(nflModel({ EmpireMaker2: OUTSIDE }), { visit: false })
    expect(vipItems(feed)[0]).toMatchObject({ priority: 'high', crossing: { path: 'out' } })
  })

  it('keeps an item for a crossing whose net moves are below every threshold, carrying rank and points pairs', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { distancePoints: 0.1, pts: 31.2 } }), { visit: false })
    expect(vipItems(feed)).toHaveLength(1)
    expect(vipItems(feed)[0]).toMatchObject({
      priority: 'high',
      crossing: { path: 'in' },
      rank: { from: 511, to: 511 },
      points: { from: 30.939999, to: 31.2 },
    })
    expect(feed.unseenCount()).toBe(1)
  })

  it('carries the full lineup on a crossing item even when nothing in it changed', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { distancePoints: 0.1 } }), { visit: false })
    expect(vipItems(feed)[0].lineup).toHaveLength(nflModel().vips[0].players.length)
  })

  it('reports out then in across several polls on one item', () => {
    const storage = memoryStorage()
    let clock = T0
    const feed = createShiftsFeed({ storage, now: () => clock })
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: true })
    for (const standing of [OUTSIDE, INSIDE]) {
      clock += 60_000
      feed.record(nflModel({ EmpireMaker2: standing }), { visit: false })
    }
    expect(vipItems(feed)).toHaveLength(1)
    expect(vipItems(feed)[0].crossing?.path).toBe('out then in')
  })

  it('reports in then out as one item even though the net state is unchanged', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    feed.record(nflModel(), { visit: false })
    expect(vipItems(feed)).toHaveLength(1)
    expect(vipItems(feed)[0]).toMatchObject({ priority: 'high', crossing: { path: 'in then out' } })
  })

  it('keeps one item id across further crossings', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    const id = feed.feed()[0].id
    feed.record(nflModel(), { visit: false })
    expect(feed.feed()[0].id).toBe(id)
  })

  it('produces no crossing for a VIP present on only one side', () => {
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
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expect(feed.feed()).toEqual([])
    expect(feed.unsurfaced()).toEqual([])
  })
})

describe('cash line moves', () => {
  it.each([
    ['points', 32.3, 500],
    ['rank', 31.24, 497],
  ])('reports a net %s move at or above its threshold as a contest-level item', (_label, points, rank) => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(nflModel({}, cashLine(points, rank)), { visit: false })
    expect(feed.feed()).toHaveLength(1)
    expect(feed.feed()[0]).toMatchObject({
      kind: 'cash-line',
      priority: 'normal',
      detectedAt: T0 + 60_000,
      points: { from: 31.239998, to: points },
      rank: { from: 500, to: rank },
    })
    expect(feed.unseenCount()).toBe(1)
  })

  it('ignores a move below both thresholds', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({}, cashLine(31.9, 499)), { visit: false })
    expect(feed.feed()).toEqual([])
  })

  it('measures from the Seen mark, so small moves accumulate', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({}, cashLine(31.9, 500)), { visit: false })
    feed.record(nflModel({}, cashLine(32.4, 500)), { visit: false })
    expect(feed.feed()[0]).toMatchObject({ kind: 'cash-line', points: { from: 31.239998, to: 32.4 } })
  })
})

describe('crossing causes', () => {
  it('carries a cash line move in the same poll as the crossing cause', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    feed.record(nflModel({ EmpireMaker2: OUTSIDE }, cashLine(33.5, 505)), { visit: false })
    expect(vipItems(feed)[0].crossing).toEqual({
      path: 'in then out',
      cause: { points: { from: 31.239998, to: 33.5 }, rank: { from: 500, to: 505 } },
    })
  })

  it('carries no cause when the line did not move in the crossing poll', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({}, cashLine(33.5, 505)), { visit: false })
    feed.record(nflModel({ EmpireMaker2: INSIDE }, cashLine(33.5, 505)), { visit: false })
    expect(vipItems(feed)[0].crossing?.cause).toBeNull()
  })

  it('carries no cause when the line move was below its threshold', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }, cashLine(31.9, 499)), { visit: false })
    expect(vipItems(feed)[0].crossing?.cause).toBeNull()
  })
})

describe('surfacing High items', () => {
  it('exposes an unsurfaced crossing until markSurfaced, and keeps it in the feed', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expect(feed.unsurfaced()).toEqual(feed.feed())
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expect(feed.unsurfaced()).toHaveLength(1)
    feed.markSurfaced([feed.feed()[0].id])
    expect(feed.unsurfaced()).toEqual([])
    expect(feed.feed()).toHaveLength(1)
    expect(feed.feed()[0].surfaced).toBe(true)
  })

  it('stays surfaced across polls and feed instances', () => {
    const storage = memoryStorage()
    const first = createShiftsFeed({ storage, now: () => T0 })
    first.record(nflModel(), { visit: true })
    first.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    first.markSurfaced([first.feed()[0].id])
    const second = createShiftsFeed({ storage, now: () => T0 + 60_000 })
    second.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    expect(second.unsurfaced()).toEqual([])
    expect(second.feed()[0].surfaced).toBe(true)
  })

  it('surfaces a later crossing of the same VIP again', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    feed.markSurfaced([feed.feed()[0].id])
    feed.record(nflModel({ EmpireMaker2: OUTSIDE }), { visit: false })
    expect(feed.unsurfaced()).toHaveLength(1)
    expect(vipItems(feed)[0].crossing?.path).toBe('in then out')
  })

  it('ignores unknown ids', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    feed.markSurfaced(['nope'])
    expect(feed.unsurfaced()).toHaveLength(1)
  })

  it('does not list Normal items as unsurfaced', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ Cubbiesftw23: { rank: 1100 } }, cashLine(40, 500)), { visit: false })
    expect(feed.feed().length).toBeGreaterThan(0)
    expect(feed.unsurfaced()).toEqual([])
  })
})

describe('the High priority log cap', () => {
  it('stops growing stored state once the log is full', () => {
    const storage = memoryStorage()
    const feed = createShiftsFeed({ storage, now: () => T0 })
    feed.record(nflModel(), { visit: true })
    const flip = (count: number) => {
      for (let index = 0; index < count; index += 1) {
        feed.record(nflModel({ EmpireMaker2: index % 2 === 0 ? INSIDE : OUTSIDE }), { visit: false })
      }
    }
    flip(200)
    const size = [...storage.data.values()].join('').length
    flip(200)
    expect([...storage.data.values()].join('').length).toBe(size)
    expect(vipItems(feed)).toHaveLength(1)
  })
})

describe('completed contest', () => {
  it('reports the change to completed once as a High contest-level item', () => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(nflModel({}, completed), { visit: false })
    expect(contestItems(feed)).toHaveLength(1)
    expect(contestItems(feed)[0]).toMatchObject({
      kind: 'contest-state',
      priority: 'high',
      detectedAt: T0 + 60_000,
      state: { from: 'live', to: 'completed' },
      surfaced: false,
    })
    expect(feed.unsurfaced()).toEqual(contestItems(feed))
    expect(feed.unseenCount()).toBe(1)
    feed.record(nflModel({}, completed), { visit: false })
    feed.record(nflModel({}, completed), { visit: false })
    expect(contestItems(feed)).toHaveLength(1)
  })

  it('lists the state change ahead of VIP items and keeps it across feed instances', () => {
    const storage = memoryStorage()
    createShiftsFeed({ storage, now: () => T0 }).record(nflModel(), { visit: true })
    const feed = createShiftsFeed({ storage, now: () => T0 + 60_000 })
    feed.record(nflModel({ EmpireMaker2: { rank: 400 } }, completed), { visit: false })
    expect(feed.feed().map((item) => item.kind)).toEqual(['contest-state', 'vip'])
    const next = createShiftsFeed({ storage, now: () => T0 + 120_000 })
    next.record(nflModel({ EmpireMaker2: { rank: 400 } }, completed), { visit: false })
    expect(contestItems(next)).toHaveLength(1)
  })

  it('stays surfaced once markSurfaced is called, and is still listed', () => {
    const storage = memoryStorage()
    const first = createShiftsFeed({ storage, now: () => T0 })
    first.record(nflModel(), { visit: true })
    first.record(nflModel({}, completed), { visit: false })
    first.markSurfaced([contestItems(first)[0].id])
    expect(first.unsurfaced()).toEqual([])
    expect(contestItems(first)[0].surfaced).toBe(true)
    const second = createShiftsFeed({ storage, now: () => T0 + 60_000 })
    second.record(nflModel({}, completed), { visit: false })
    expect(second.unsurfaced()).toEqual([])
    expect(contestItems(second)[0].surfaced).toBe(true)
  })

  it('compares only final rank, points and cashing, with no lineup and no player-level detail', () => {
    const { feed } = seededFeed()
    feed.record(
      nflModel({ EmpireMaker2: { rank: 480, pts: 33.5, distancePoints: 1.2 } }, (snapshot) => {
        completed(snapshot)
        pooled(snapshot, LAWRENCE, { fantasy_points: 15.44, game_status: 'Final' })
        lineupOf(snapshot, 'EmpireMaker2')[6] = {
          slot: 'TE',
          player_key: HIGBEE,
          player_name: 'Tyler Higbee',
          is_live: true,
        }
      }),
      { visit: false },
    )
    const [item] = vipItems(feed)
    expect(vipItems(feed)).toHaveLength(1)
    expect(item).toMatchObject({
      vipKey: KEY.empire,
      // Entering the money in the completing poll is still a crossing.
      priority: 'high',
      crossing: { path: 'in' },
      rank: { from: 511, to: 480 },
      points: { from: 30.939999, to: 33.5 },
      finishedCashing: true,
    })
    expect(item.lineup).toBeUndefined()
  })

  it('reports a VIP whose final standing moved by any amount, with whether each finished cashing', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { rank: 510 }, Cubbiesftw23: { pts: 40 } }, completed), { visit: false })
    expect(
      vipItems(feed)
        .map((item) => [item.vipKey, item.finishedCashing])
        .sort(),
    ).toEqual(
      [
        [KEY.empire, false],
        [KEY.cubbies, false],
      ].sort(),
    )
  })

  it('reports a VIP whose only final change is finishing in the money', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { distancePoints: 0.4 } }, completed), { visit: false })
    expect(vipItems(feed)).toHaveLength(1)
    expect(vipItems(feed)[0]).toMatchObject({ finishedCashing: true, rank: { from: 511, to: 511 } })
  })

  it('produces no item for a VIP whose final standing is unchanged', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({}, completed), { visit: false })
    expect(vipItems(feed)).toEqual([])
  })

  it('logs a cash flip in the completing poll as a High crossing, then suppresses later flips', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }, completed), { visit: false })
    expect(feed.feed().map((item) => item.kind)).toEqual(['contest-state', 'vip'])
    expect(vipItems(feed)[0]).toMatchObject({ priority: 'high', crossing: { path: 'in' }, finishedCashing: true })
    // From the next poll on only the final standing is compared, so these flips add no crossing.
    feed.record(nflModel({ EmpireMaker2: OUTSIDE }, completed), { visit: false })
    feed.record(nflModel({ EmpireMaker2: INSIDE }, completed), { visit: false })
    expect(vipItems(feed)).toHaveLength(1)
    expect(vipItems(feed)[0].crossing).toEqual(expect.objectContaining({ path: 'in' }))
    expect(feed.unsurfaced().map((item) => item.kind)).toEqual(['contest-state', 'vip'])
  })

  it('keeps a crossing made before completion as a High final item without a lineup', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: INSIDE }), { visit: false })
    feed.record(nflModel({ EmpireMaker2: INSIDE }, completed), { visit: false })
    expect(feed.feed().map((item) => item.kind)).toEqual(['contest-state', 'vip'])
    expect(vipItems(feed)[0]).toMatchObject({ priority: 'high', crossing: { path: 'in' }, finishedCashing: true })
    expect(vipItems(feed)[0].lineup).toBeUndefined()
    expect(feed.unsurfaced()).toHaveLength(2)
  })

  it('is cleared by marking as seen, even after it was surfaced, and does not return', () => {
    const { feed } = seededFeed()
    feed.record(nflModel({ EmpireMaker2: { rank: 400 } }, completed), { visit: false })
    feed.markSurfaced([contestItems(feed)[0].id])
    expect(contestItems(feed)).toHaveLength(1)
    feed.markSeen()
    expectQuiet(feed)
    feed.record(nflModel({ EmpireMaker2: { rank: 400 } }, completed), { visit: false })
    expectQuiet(feed)
  })

  it('reports nothing for a contest first seen as completed', () => {
    const feed = feedOver(memoryStorage())
    feed.record(nflModel({}, completed), { visit: true })
    expectQuiet(feed)
    feed.record(nflModel({}, completed), { visit: false })
    expectQuiet(feed)
  })
})
