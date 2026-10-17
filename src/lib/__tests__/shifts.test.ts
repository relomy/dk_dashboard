import { describe, expect, it } from 'vitest'
// Exported by the dk_results producer: cfb and mlb contests (provenance in public/mock/PRODUCER_FIXTURE.md).
import producerSnapshot from '../../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { buildLiveModel, type LiveModel } from '../liveModel'
import { buildTimeline, createShiftsFeed, digestOf, diffDigests, type Digest, type ShiftsStorage, type TimelineInput, type VipShiftItem } from '../shifts'
// Exported by the dk_results producer: an NFL mid-slate contest with six VIPs.
import nflSnapshot from '../../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'

/* eslint-disable @typescript-eslint/no-explicit-any */
function modelOf(sport: string, mutate: (snapshot: any) => void = () => {}): LiveModel {
  const snapshot: any = structuredClone(producerSnapshot)
  mutate(snapshot)
  const result = buildLiveModel(snapshot, sport)
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}

function otherSlate(snapshot: any) {
  snapshot.sports.cfb.contests[0].name = 'Tomorrow Slate'
  snapshot.sports.cfb.contests[0].start_time = '2099-01-01T00:00:00Z'
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function memoryStorage(initial: Record<string, string> = {}): ShiftsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

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

const T0 = Date.parse('2026-10-03T21:00:00Z')

function feedOver(storage: ShiftsStorage | null) {
  return createShiftsFeed({ storage, now: () => T0 })
}

function expectQuiet(feed: ReturnType<typeof feedOver>) {
  expect(feed.feed()).toEqual([])
  expect(feed.unseenCount()).toBe(0)
  expect(feed.unsurfaced()).toEqual([])
  expect(feed.awaySummary()).toBeNull()
}

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

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Standing {
  rank?: number
  pts?: number
  distancePoints?: number
  distanceRank?: number
}

function nflModel(changes: Record<string, Standing> = {}, edit: (snapshot: any) => void = () => {}): LiveModel {
  const snapshot: any = structuredClone(nflSnapshot)
  const contest = snapshot.sports.nfl.contests[0]
  for (const [name, change] of Object.entries(changes)) {
    const lineup = contest.vip_lineups.find((vip: any) => vip.display_name === name)
    const distance = contest.metrics.distance_to_cash.per_vip.find((vip: any) => vip.display_name === name)
    if (change.rank !== undefined) lineup.rank = change.rank
    if (change.pts !== undefined) lineup.pts = change.pts
    if (change.distancePoints !== undefined) distance.points_delta = change.distancePoints
    if (change.distanceRank !== undefined) distance.rank_delta = change.distanceRank
  }
  edit(snapshot)
  const result = buildLiveModel(snapshot, 'nfl')
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const KEY = { empire: '5275499864', cubbies: '5280114900', tuck: '5280874445' }

function seededFeed(clockAt = T0) {
  let clock = clockAt
  const feed = createShiftsFeed({ storage: memoryStorage(), now: () => clock })
  feed.record(nflModel(), { visit: true })
  return {
    feed,
    at(time: number) {
      clock = time
    },
  }
}

function vipItems(feed: ReturnType<typeof createShiftsFeed>) {
  return feed.feed().filter((item): item is VipShiftItem => item.kind === 'vip')
}

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
        contest.vip_lineups.push({ ...structuredClone(contest.vip_lineups[0]), entry_key: 'new-1', vip_entry_key: 'new-1', display_name: 'NewVip' })
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
        contest.vip_lineups = contest.vip_lineups.filter((vip: { display_name: string }) => vip.display_name !== 'EmpireMaker2')
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

/* eslint-disable @typescript-eslint/no-explicit-any */
const LAWRENCE = 'nfl:trevor-lawrence:jax:5900:qb'
const BROWN = 'nfl:chase-brown:cin:6100:rb'
const WILSON = 'nfl:garrett-wilson:nyj:6800:wr'
const WASHINGTON = 'nfl:parker-washington:jax:6500:wr'
const RAMS = 'nfl:rams:lar:2600:dst'
const HIGBEE = 'nfl:tyler-higbee:lar:3100:te'

/** Edits one pool player's figures (points, game status, stats line). */
function pooled(snapshot: any, playerKey: string, patch: Record<string, unknown>) {
  const player = snapshot.sports.nfl.players.find((row: any) => row.player_key === playerKey)
  Object.assign(player, patch)
}

function lineupOf(snapshot: any, name: string): any[] {
  return snapshot.sports.nfl.contests[0].vip_lineups.find((vip: any) => vip.display_name === name).players_live
}

/** EmpireMaker2 moves five ranks so that it gets an item; `edit` shapes the lineup and pool. */
function empireModel(edit: (snapshot: any) => void = () => {}): LiveModel {
  return nflModel({ EmpireMaker2: { rank: 506 } }, edit)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('lineup diff', () => {
  it('lists every slot of the lineup, the scoring player first with its own points move', () => {
    const { feed } = seededFeed()
    feed.record(empireModel((snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 15.44 })), { visit: false })
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
    feed.record(empireModel((snapshot) => pooled(snapshot, WILSON, { game_status: 'Final' })), { visit: false })
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
    expect(vipItems(feed)[0].lineup?.slice(1).every((slot) => slot.stats === undefined)).toBe(true)
  })

  it('reports no stats move when the line is unchanged or has gone', () => {
    const feed = createShiftsFeed({ storage: memoryStorage(), now: () => T0 })
    feed.record(nflModel({}, (snapshot) => pooled(snapshot, LAWRENCE, { stats_text: '2 TD' })), { visit: true })
    feed.record(empireModel((snapshot) => pooled(snapshot, BROWN, { fantasy_points: 12 })), { visit: false })
    const unchanged = vipItems(feed)[0].lineup?.find((slot) => slot.playerKey === LAWRENCE)
    expect(unchanged).toMatchObject({ pointsMove: 0 })
    expect(unchanged?.stats).toBeUndefined()
    feed.record(empireModel((snapshot) => pooled(snapshot, LAWRENCE, { stats_text: null })), { visit: false })
    expect(vipItems(feed)[0].lineup?.find((slot) => slot.playerKey === LAWRENCE)?.stats).toBeUndefined()
  })

  it('reports a slot reveal as no points to the first points, crediting nothing before it', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => {
        lineupOf(snapshot, 'EmpireMaker2')[6] = { slot: 'TE', player_key: HIGBEE, player_name: 'Tyler Higbee', is_live: true }
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
        lineupOf(snapshot, 'EmpireMaker2')[1] = { slot: 'RB', player_key: BROWN, player_name: 'Chase Brown', is_live: true }
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
    expect(swappedIn).toMatchObject({ points: { from: null, to: 3.3 }, pointsMove: null, locked: { from: false, to: false } })
    expect(vipItems(feed)[0].lineup?.some((slot) => slot.playerKey === WASHINGTON)).toBe(false)
    expect(vipItems(feed)[0].lineup?.every((slot) => (slot.pointsMove ?? 0) === 0)).toBe(true)
  })

  it('lets slot position decide when a swap and a reveal share a slot label', () => {
    const { feed } = seededFeed()
    feed.record(
      empireModel((snapshot) => {
        const lineup = lineupOf(snapshot, 'EmpireMaker2')
        // The two WR rows after Wilson: Washington was live, the next row was locked.
        lineup[4] = { slot: 'WR', player_key: 'nfl:dontayvion-wicks:phi:4300:wr', player_name: 'Dontayvion Wicks', is_live: true }
        lineup[5] = { slot: 'WR', player_key: WASHINGTON, player_name: 'Parker Washington', is_live: true }
        pooled(snapshot, WASHINGTON, { fantasy_points: 7.5 })
      }),
      { visit: false },
    )
    const lineup = vipItems(feed)[0].lineup ?? []
    // Position 5 was locked, so it is a reveal: Washington's whole 7.5 is its move, though he sat in position 4 before.
    const revealed = lineup.find((slot) => slot.playerKey === WASHINGTON)
    expect(revealed).toMatchObject({ locked: { from: true, to: false }, points: { from: null, to: 7.5 }, pointsMove: 7.5 })
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
    feed.record(nflModel({}, (snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 20 })), { visit: false })
    expect(feed.feed()).toEqual([])
  })

  it('measures the lineup from the Seen mark, so it accumulates across polls', () => {
    const { feed } = seededFeed()
    feed.record(empireModel((snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 11.44 })), { visit: false })
    feed.record(empireModel((snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 13.44 })), { visit: false })
    expect(vipItems(feed)[0].lineup?.[0]).toMatchObject({ points: { from: 9.44, to: 13.44 }, pointsMove: 4 })
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */
function cashLine(points: number, rank: number) {
  return (snapshot: any) => {
    const line = snapshot.sports.nfl.contests[0].live_metrics.cash_line
    line.points_cutoff = points
    line.rank_cutoff = rank
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// The seeded Seen mark has EmpireMaker2 just outside cashing (-0.3 points); the line is 31.24 points at rank 500.
const INSIDE = { distancePoints: 0.5 }
const OUTSIDE = { distancePoints: -0.5 }

describe('cash crossings', () => {
  it('reports a VIP entering cashing as a High item listed ahead of Normal items', () => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(nflModel({ EmpireMaker2: { distancePoints: 2.2, distanceRank: -2, rank: 505 }, Cubbiesftw23: { rank: 1100 } }), {
      visit: false,
    })
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
        contest.vip_lineups = contest.vip_lineups.filter((vip: { display_name: string }) => vip.display_name !== 'EmpireMaker2')
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

const MINUTE = 60_000

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

/* eslint-disable @typescript-eslint/no-explicit-any */
function completed(snapshot: any) {
  snapshot.sports.nfl.contests[0].state = 'completed'
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function contestItems(feed: ReturnType<typeof createShiftsFeed>) {
  return feed.feed().filter((item) => item.kind === 'contest-state')
}

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
        lineupOf(snapshot, 'EmpireMaker2')[6] = { slot: 'TE', player_key: HIGBEE, player_name: 'Tyler Higbee', is_live: true }
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
    expect(vipItems(feed).map((item) => [item.vipKey, item.finishedCashing]).sort()).toEqual(
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function withoutVip(name: string) {
  return (snapshot: any) => {
    const contest = snapshot.sports.nfl.contests[0]
    contest.vip_lineups = contest.vip_lineups.filter((vip: any) => vip.display_name !== name)
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
        nflModel({ EmpireMaker2: { rank: 480 } }, (snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 15.44, game_status: 'Final' })),
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

describe('timeline', () => {
  const minute = (n: number) => `2026-10-04T18:${String(40 + n).padStart(2, '0')}:00Z`

  /** A digest of an NFL model stamped as the snapshot taken `n` minutes after 18:40. */
  function snap(n: number, model: LiveModel = nflModel()): Digest {
    return digestOf({ ...model, snapshotAt: minute(n) }, T0 + n * MINUTE)
  }

  const stepsOf = (inputs: TimelineInput[], options?: Parameters<typeof buildTimeline>[1]) => buildTimeline(inputs, options).entries

  describe('steps', () => {
    it('is empty for no snapshot or one snapshot', () => {
      expect(stepsOf([])).toEqual([])
      expect(stepsOf([snap(0)])).toEqual([])
    })

    it('makes one step per consecutive snapshot pair, newest first, timed by the later snapshot', () => {
      const entries = stepsOf([
        snap(0),
        snap(5, nflModel({ EmpireMaker2: { rank: 480 } })),
        snap(10, nflModel({ EmpireMaker2: { rank: 400 } })),
        snap(15, nflModel({ EmpireMaker2: { rank: 400 } })),
      ])
      expect(entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual([
        ['step', minute(15)],
        ['step', minute(10)],
        ['step', minute(5)],
      ])
      const [newest, middle] = entries
      expect(newest).toMatchObject({ kind: 'step', items: [] })
      expect(middle).toMatchObject({ kind: 'step', items: [{ vipKey: KEY.empire, rank: { from: 480, to: 400 }, snapshotAt: minute(10) }] })
    })

    it('gives the same item and step ids when the same snapshots are rebuilt later', () => {
      const models = [nflModel(), nflModel({ EmpireMaker2: { rank: 480 } }, cashLine(33.5, 505)), nflModel({ EmpireMaker2: INSIDE })]
      const build = (clock: number) => stepsOf(models.map((model, n) => digestOf({ ...model, snapshotAt: minute(n * 5) }, clock + n)))
      const ids = (entries: ReturnType<typeof build>) => entries.flatMap((entry) => [entry.id, ...(entry.kind === 'step' ? entry.items.map((item) => item.id) : [])])
      expect(ids(build(1))).toEqual(ids(build(999_999)))
      expect(new Set(ids(build(1))).size).toBe(ids(build(1)).length)
    })

    it('shows a VIP crossing in and then out as two items in two steps, both High', () => {
      const entries = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: INSIDE })), snap(10, nflModel({ EmpireMaker2: OUTSIDE }))])
      const crossings = entries.map((entry) => (entry.kind === 'step' ? entry.items : []))
      expect(crossings).toEqual([
        [expect.objectContaining({ vipKey: KEY.empire, priority: 'high', crossing: expect.objectContaining({ path: 'out' }) })],
        [expect.objectContaining({ vipKey: KEY.empire, priority: 'high', crossing: expect.objectContaining({ path: 'in' }) })],
      ])
    })
  })

  describe('cash line', () => {
    const itemsOf = (entry: ReturnType<typeof stepsOf>[number]) => (entry.kind === 'step' ? entry.items : [])

    it('links a cash line move to the crossing it caused, in the same step', () => {
      const [step] = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: INSIDE }, cashLine(33.5, 505)))])
      const items = itemsOf(step)
      const vip = items.find((item): item is VipShiftItem => item.kind === 'vip')
      const line = items.find((item) => item.kind === 'cash-line')
      expect(vip?.crossing?.cause).not.toBeNull()
      expect(line).toMatchObject({ kind: 'cash-line', causedCrossings: [vip?.id] })
    })

    it('lists a cash line move with no crossing as its own item with no cause link', () => {
      const [step] = stepsOf([snap(0), snap(5, nflModel({}, cashLine(33.5, 505)))])
      expect(itemsOf(step)).toEqual([expect.objectContaining({ kind: 'cash-line', parts: ['cash-line'] })])
      expect(itemsOf(step)[0]).not.toHaveProperty('causedCrossings')
    })

    it('does not link a crossing when the line moved in another step', () => {
      const entries = stepsOf([snap(0), snap(5, nflModel({}, cashLine(33.5, 505))), snap(10, nflModel({ EmpireMaker2: INSIDE }, cashLine(33.5, 505)))])
      expect(itemsOf(entries[0]).map((item) => item.kind)).toEqual(['vip'])
      expect(itemsOf(entries[1]).map((item) => item.kind)).toEqual(['cash-line'])
    })
  })

  describe('per-step moves', () => {
    it('applies the thresholds to each step, so a slow drift under them is not reported', () => {
      const entries = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: { rank: 510 } })), snap(10, nflModel({ EmpireMaker2: { rank: 509 } })), snap(15, nflModel({ EmpireMaker2: { rank: 508 } }))])
      expect(entries.map((entry) => (entry.kind === 'step' ? entry.items : null))).toEqual([[], [], []])
    })

    it('reports a player event and exposes the whole lineup, changed or not', () => {
      const [moved] = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: { rank: 480 } }, (snapshot) => pooled(snapshot, LAWRENCE, { fantasy_points: 15.44, game_status: 'Final' })))])
      const item = (moved.kind === 'step' ? moved.items : [])[0] as VipShiftItem
      expect(item.parts).toEqual(['rank-points', 'player-events'])
      expect(item.lineup?.length).toBeGreaterThan(1)
      expect(item.lineup?.some((slot) => slot.pointsMove === 0)).toBe(true)
    })

    it('carries no VIP display names', () => {
      const entries = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: { rank: 480 } }))])
      expect(JSON.stringify(entries)).not.toContain('EmpireMaker2')
    })
  })

  describe('gaps', () => {
    it('puts a gap entry with its reason where the skipped snapshot was and compares across it', () => {
      const entries = stepsOf([snap(0), { reason: 'unavailable', snapshotAt: minute(5) }, snap(10, nflModel({ EmpireMaker2: { rank: 480 } }))])
      expect(entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual([
        ['step', minute(10)],
        ['gap', minute(5)],
      ])
      expect(entries[0]).toMatchObject({ items: [{ vipKey: KEY.empire, rank: { from: 511, to: 480 } }] })
      expect(entries[1]).toMatchObject({ kind: 'gap', reason: 'unavailable' })
    })

    it('keeps a not-fresh reason, and several gaps in a row, and a gap at the start', () => {
      const entries = stepsOf([
        { reason: 'not-fresh', snapshotAt: minute(0) },
        snap(5),
        { reason: 'not-fresh', snapshotAt: minute(10) },
        { reason: 'unavailable', snapshotAt: minute(15) },
        snap(20),
      ])
      expect(entries.map((entry) => [entry.kind, entry.kind === 'gap' ? entry.reason : null])).toEqual([
        ['step', null],
        ['gap', 'unavailable'],
        ['gap', 'not-fresh'],
        ['gap', 'not-fresh'],
      ])
    })
  })

  describe('completed contest', () => {
    const done = (changes = {}) => nflModel(changes, completed)

    it('gives every step up to completion, then one High item with the final standings, and nothing after', () => {
      const entries = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: { rank: 480 } })), snap(10, done({ EmpireMaker2: { rank: 470 } })), snap(15, done({ EmpireMaker2: { rank: 400 } })), snap(20, done())])
      const items = entries.map((entry) => (entry.kind === 'step' ? entry.items : []))
      expect(items[0]).toEqual([])
      expect(items[1]).toEqual([])
      expect(items[3]).toHaveLength(1)
      expect(items[2]).toEqual([
        expect.objectContaining({
          kind: 'contest-state',
          priority: 'high',
          state: { from: 'live', to: 'completed' },
          standings: expect.arrayContaining([{ vipKey: KEY.empire, rank: { from: 480, to: 470 }, points: expect.anything(), cashing: false }]),
        }),
      ])
    })

    it('holds final standings once, not as per-VIP items', () => {
      const entries = stepsOf([snap(0), snap(5, done({ EmpireMaker2: { rank: 400 } }))])
      const items = entries[0].kind === 'step' ? entries[0].items : []
      expect(items.map((item) => item.kind)).toEqual(['contest-state'])
      expect(items[0].kind === 'contest-state' && items[0].standings).toHaveLength(nflModel().vips.length)
    })
  })

  describe('range note', () => {
    it('says the timeline starts from the oldest snapshot by default', () => {
      expect(buildTimeline([snap(5), snap(10)]).rangeNote).toEqual({ kind: 'from', snapshotAt: minute(5) })
    })

    it('says the contest start or the cap when told what stopped the range', () => {
      expect(buildTimeline([snap(5), snap(10)], { reach: 'contest-start' }).rangeNote).toEqual({ kind: 'contest-start', snapshotAt: minute(5) })
      expect(buildTimeline([snap(5), snap(10)], { reach: 'cap' }).rangeNote).toEqual({ kind: 'cap', snapshotAt: minute(5) })
    })

    it('has no note without snapshots', () => {
      expect(buildTimeline([]).rangeNote).toBeNull()
    })
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
    feed.record(nflModel({}, (snapshot) => (snapshot.snapshot_at = LATER_AT)), { visit: false })
    expect(feed.seenSnapshotAt()).toBe(SEEN_AT)
    feed.markSeen()
    expect(feed.seenSnapshotAt()).toBe(LATER_AT)
  })

  it('moves when a quick visit advances the Seen mark on its own', () => {
    const { feed, at } = seededFeed()
    at(T0 + 60_000)
    feed.record(nflModel({}, (snapshot) => (snapshot.snapshot_at = LATER_AT)), { visit: true })
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
