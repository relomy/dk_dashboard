import { describe, expect, it } from 'vitest'
import type { LiveModel } from '../liveModel'
import {
  memoryStorage,
  T0,
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
  completed,
} from './shiftsTestKit'
import { createShiftsFeed, digestOf, diffDigests, type VipShiftItem } from '../shifts'

/* eslint-disable @typescript-eslint/no-explicit-any */
const BROWN = 'nfl:chase-brown:cin:6100:rb'
const WILSON = 'nfl:garrett-wilson:nyj:6800:wr'
const WASHINGTON = 'nfl:parker-washington:jax:6500:wr'
const RAMS = 'nfl:rams:lar:2600:dst'

/** EmpireMaker2 moves five ranks so that it gets an item; `edit` shapes the lineup and pool. */
function empireModel(edit: (snapshot: any) => void = () => {}): LiveModel {
  return nflModel({ EmpireMaker2: { rank: 506 } }, edit)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('lineup diff', () => {
  it('lists every slot of the lineup, the scoring player first with its own points move', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 15.44 })),
      { visit: false },
    )
    const [item] = vipItems(feed)
    expect(item.lineup).toHaveLength(9)
    expect(item.lineup?.[0]).toMatchObject({
      slot: 'QB',
      name: 'Trevor Lawrence',
      playerKey: LAWRENCE,
      points: { from: 9.44, to: 15.44 },
      pointsMove: 6,
      locked: { from: false, to: false },
      gameStatus: { from: 'in-progress', to: 'in-progress' },
    })
  })

  it('orders changed players by absolute points move, then unchanged players, then still-hidden slots', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => {
        pooled(snapshot, LAWRENCE, { fantasy_points: 10.44 })
        pooled(snapshot, BROWN, { fantasy_points: 4.6 })
        pooled(snapshot, RAMS, { fantasy_points: 4 })
      }),
      { visit: false },
    )
    const [item] = vipItems(feed)
    expect(item.lineup?.map((slot) => [slot.slot, slot.pointsMove])).toEqual([
      ['RB', -5],
      ['QB', 1],
      ['DST', 1],
      ['RB', 0],
      ['WR', 0],
      ['WR', 0],
      ['WR', null],
      ['TE', null],
      ['FLEX', null],
    ])
    const hidden = item.lineup?.slice(-3)
    expect(hidden?.every((slot) => slot.locked.to && slot.points.to === null && slot.points.from === null)).toBe(true)
  })

  it('reports a game going final as a status change on that player', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => pooled(snapshot, WILSON, { game_status: 'Final' })),
      { visit: false },
    )
    const [item] = vipItems(feed)
    expect(item.lineup?.[0]).toMatchObject({
      playerKey: WILSON,
      pointsMove: 0,
      gameStatus: { from: 'in-progress', to: 'final' },
    })
  })

  it('reports a stats line only when it adds information', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => {
        pooled(snapshot, LAWRENCE, { stats_text: '2 TD' })
      }),
      { visit: false },
    )
    expect(vipItems(feed)[0].lineup?.[0]).toMatchObject({ playerKey: LAWRENCE, stats: { from: null, to: '2 TD' } })
    expect(
      vipItems(feed)[0]
        .lineup?.slice(1)
        .every((slot) => slot.stats === undefined),
    ).toBe(true)
  })

  it('reports no stats move when the line is unchanged or has gone', () => {
    const feed = createShiftsFeed({ storage: memoryStorage(), now: () => T0 })
    feed.record(
      nflModel({}, (snapshot) => pooled(snapshot, LAWRENCE, { stats_text: '2 TD' })),
      { visit: true },
    )
    feed.record(
      empireModel((snapshot) => pooled(snapshot, BROWN, { fantasy_points: 12 })),
      { visit: false },
    )
    const unchanged = vipItems(feed)[0].lineup?.find((slot) => slot.playerKey === LAWRENCE)
    expect(unchanged).toMatchObject({ pointsMove: 0 })
    expect(unchanged?.stats).toBeUndefined()
    feed.record(
      empireModel((snapshot) => pooled(snapshot, LAWRENCE, { stats_text: null })),
      { visit: false },
    )
    expect(vipItems(feed)[0].lineup?.find((slot) => slot.playerKey === LAWRENCE)?.stats).toBeUndefined()
  })

  it('reports a slot reveal as no points to the first points, crediting nothing before it', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => {
        lineupOf(snapshot, 'EmpireMaker2')[6] = {
          slot: 'TE',
          player_key: HIGBEE,
          player_name: 'Tyler Higbee',
          is_live: true,
        }
        pooled(snapshot, HIGBEE, { fantasy_points: 4.2 })
      }),
      { visit: false },
    )
    const [item] = vipItems(feed)
    expect(item.lineup?.[0]).toMatchObject({
      slot: 'TE',
      name: 'Tyler Higbee',
      playerKey: HIGBEE,
      points: { from: null, to: 4.2 },
      pointsMove: 4.2,
      locked: { from: true, to: false },
    })
    expect(item.lineup?.filter((slot) => slot.locked.to)).toHaveLength(2)
  })

  it('treats a swap as no shift and no cross-player points move', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => {
        lineupOf(snapshot, 'EmpireMaker2')[1] = {
          slot: 'RB',
          player_key: BROWN,
          player_name: 'Chase Brown',
          is_live: true,
        }
        // Washington (6.5k WR) is swapped for Wicks in the same slot position.
        lineupOf(snapshot, 'EmpireMaker2')[4] = {
          slot: 'WR',
          player_key: 'nfl:dontayvion-wicks:phi:4300:wr',
          player_name: 'Dontayvion Wicks',
          is_live: true,
        }
      }),
      { visit: false },
    )
    const swappedIn = vipItems(feed)[0].lineup?.find((slot) => slot.name === 'Dontayvion Wicks')
    expect(swappedIn).toMatchObject({
      points: { from: null, to: 3.3 },
      pointsMove: null,
      locked: { from: false, to: false },
    })
    expect(vipItems(feed)[0].lineup?.some((slot) => slot.playerKey === WASHINGTON)).toBe(false)
    expect(vipItems(feed)[0].lineup?.every((slot) => (slot.pointsMove ?? 0) === 0)).toBe(true)
  })

  it('lets slot position decide when a swap and a reveal share a slot label', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => {
        const lineup = lineupOf(snapshot, 'EmpireMaker2')
        // The two WR rows after Wilson: Washington was live, the next row was locked.
        lineup[4] = {
          slot: 'WR',
          player_key: 'nfl:dontayvion-wicks:phi:4300:wr',
          player_name: 'Dontayvion Wicks',
          is_live: true,
        }
        lineup[5] = { slot: 'WR', player_key: WASHINGTON, player_name: 'Parker Washington', is_live: true }
        pooled(snapshot, WASHINGTON, { fantasy_points: 7.5 })
      }),
      { visit: false },
    )
    const lineup = vipItems(feed)[0].lineup ?? []
    // Position 5 was locked, so it is a reveal: Washington's whole 7.5 is its move, though he sat in position 4 before.
    const revealed = lineup.find((slot) => slot.playerKey === WASHINGTON)
    expect(revealed).toMatchObject({
      locked: { from: true, to: false },
      points: { from: null, to: 7.5 },
      pointsMove: 7.5,
    })
    // Position 4 changed player: a swap, with no points move.
    const swapped = lineup.find((slot) => slot.name === 'Dontayvion Wicks')
    expect(swapped).toMatchObject({ locked: { from: false, to: false }, pointsMove: null })
    expect(lineup[0]).toBe(revealed)
  })

  it('gives each VIP its own item for the same player', () => {
    const { feed } = seededFeed()
    feed.record(
      nflModel({ EmpireMaker2: { rank: 506 }, Cubbiesftw23: { rank: 1100 } }, (snapshot) =>
        pooled(snapshot, LAWRENCE, { fantasy_points: 12.44 }),
      ),
      { visit: false },
    )
    const items = vipItems(feed)
    expect(items.map((item) => item.vipKey).sort()).toEqual([KEY.cubbies, KEY.empire].sort())
    for (const item of items) {
      expect(item.lineup?.find((slot) => slot.playerKey === LAWRENCE)).toMatchObject({ pointsMove: 3 })
    }
  })

  it('gives no item for a lineup change alone', () => {
    const { feed } = seededFeed()
    feed.record(
      nflModel({}, (snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 20 })),
      { visit: false },
    )
    expect(feed.feed()).toEqual([])
  })

  it('measures the lineup from the Seen mark, so it accumulates across polls', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 11.44 })),
      { visit: false },
    )
    feed.record(
      empireModel((snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 13.44 })),
      { visit: false },
    )
    expect(vipItems(feed)[0].lineup?.[0]).toMatchObject({ points: { from: 9.44, to: 13.44 }, pointsMove: 4 })
  })
})

describe('pair diff', () => {
  const BEFORE_AT = T0
  const AFTER_AT = T0 + 300_000

  /** Digests of two NFL models; the later one is stamped with a later snapshot time. */
  function pair(after: LiveModel, before: LiveModel = nflModel()) {
    return {
      before: digestOf({ ...before, snapshotAt: '2026-10-04T18:40:00Z' }, BEFORE_AT),
      after: digestOf({ ...after, snapshotAt: '2026-10-04T18:45:00Z' }, AFTER_AT),
    }
  }

  const diff = (after: LiveModel, before?: LiveModel) => {
    const digests = pair(after, before)
    return diffDigests(digests.before, digests.after)
  }

  it('returns nothing for two identical digests', () => {
    expect(diff(nflModel())).toEqual([])
  })

  it('reports one step of change, carrying the later snapshot time apart from the build clock', () => {
    const items = diff(nflModel({ EmpireMaker2: { rank: 480 } }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'vip',
      vipKey: KEY.empire,
      rank: { from: 511, to: 480 },
      snapshotAt: '2026-10-04T18:45:00Z',
      detectedAt: AFTER_AT,
    })
    expect(items[0].surfaced).toBeUndefined()
  })

  it('gives the same ids when the same pair is rebuilt at another time', () => {
    const later = { ...pair(nflModel({ EmpireMaker2: { rank: 480 } }, cashLine(33.5, 505))) }
    const first = diffDigests(later.before, later.after)
    const again = diffDigests({ ...later.before, at: 1 }, { ...later.after, at: 2 })
    expect(first).toHaveLength(2)
    expect(again.map((item) => item.id)).toEqual(first.map((item) => item.id))
    expect(new Set(first.map((item) => item.id)).size).toBe(2)
  })

  it('applies the feed thresholds to the one step', () => {
    expect(diff(nflModel({ EmpireMaker2: { rank: 510 } }, cashLine(31.9, 499)))).toEqual([])
  })

  it('does not net: a crossing in is its own High item for the step', () => {
    const [item] = diff(nflModel({ EmpireMaker2: INSIDE }))
    expect(item).toMatchObject({ vipKey: KEY.empire, priority: 'high', crossing: { path: 'in' } })
  })

  it('carries a cash line move in the same step as the crossing cause', () => {
    const items = diff(nflModel({ EmpireMaker2: INSIDE }, cashLine(33.5, 505)))
    const vip = items.find((item): item is VipShiftItem => item.kind === 'vip')
    expect(vip?.crossing?.cause).toEqual({ points: { from: 31.239998, to: 33.5 }, rank: { from: 500, to: 505 } })
  })

  it('reports the contest completing as one High contest state item, and nothing after it', () => {
    const live = nflModel()
    const done = nflModel({}, completed)
    const items = diff(done, live)
    expect(items.filter((item) => item.kind === 'contest-state')).toEqual([
      expect.objectContaining({ priority: 'high', state: { from: 'live', to: 'completed' }, parts: ['contest-state'] }),
    ])
    const digests = pair(nflModel({ EmpireMaker2: { rank: 400 } }, completed), done)
    expect(diffDigests(digests.before, digests.after)).toEqual([])
  })

  describe('parts', () => {
    it('lists rank and points when only those passed their thresholds', () => {
      const [item] = diff(nflModel({ EmpireMaker2: { rank: 480 } }))
      expect(item.parts).toEqual(['rank-points'])
    })

    it('adds player events when a lineup slot changed', () => {
      const [item] = diff(
        nflModel({ EmpireMaker2: { rank: 480 } }, (snapshot) =>
          pooled(snapshot, LAWRENCE, { fantasy_points: 15.44, game_status: 'Final' }),
        ),
      )
      expect(item.parts).toEqual(['rank-points', 'player-events'])
    })

    it('adds crossings for a crossing, even when the rank and points did not move enough', () => {
      const [item] = diff(nflModel({ EmpireMaker2: INSIDE }))
      expect(item.parts).toEqual(['crossings'])
    })

    it('marks a cash line move as cash line', () => {
      const [item] = diff(nflModel({}, cashLine(33.5, 505)))
      expect(item).toMatchObject({ kind: 'cash-line', parts: ['cash-line'] })
    })
  })
})

describe('feed items', () => {
  it('carry the snapshot they came from and their parts', () => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(nflModel({ EmpireMaker2: { rank: 480 } }, cashLine(33.5, 505)), { visit: false })
    const model = nflModel()
    expect(feed.feed().map((item) => [item.kind, item.snapshotAt, item.parts])).toEqual([
      ['vip', model.snapshotAt, ['rank-points']],
      ['cash-line', model.snapshotAt, ['cash-line']],
    ])
  })
})
