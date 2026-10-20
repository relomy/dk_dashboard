import { describe, expect, it } from 'vitest'
import { largestTrains } from '../liveModel'
import { contestOf, load, modelOf, type Json } from './liveModelTestKit'

describe('trains', () => {
  function trainsOf(snapshot: unknown, sport = 'cfb') {
    const trains = modelOf(snapshot, sport).trains
    if (trains.availability !== 'available') throw new Error('Expected trains to be available')
    return trains.data
  }

  it('lists every emitted train, best rank first, from the canonical fixture', () => {
    const trains = trainsOf(load())

    expect(trains.updatedAt).toBe('2026-10-03T20:48:31Z')
    expect(trains.rule).toBe('salary_remaining<=40000_and_same_points_pmr')
    expect(trains.rows).toHaveLength(24)
    expect(trains.rows.slice(0, 3).map((train) => train.rank)).toEqual([2, 8, 18])
    expect(trains.rows[0]).toMatchObject({
      id: '9c5f5c8452ef',
      entries: 2,
      rank: 2,
      points: 190.81998,
      pmr: 125.299995,
      entryKeys: ['5278431522', '5279178148'],
      lineup: [
        'Kamario Taylor',
        'Aiden Flora',
        'Ousmane Kromah',
        'Anthony Evans III',
        'Kenny Darby',
        'Rico Scott',
        'Cayden Lee',
        'Michael Hawkins Jr.',
      ].map((label) => ({ label, locked: false })),
    })
  })

  it('marks locked slots in a train lineup', () => {
    const [best] = trainsOf(load(), 'mlb').rows

    expect(best?.lineup.filter((slot) => slot.locked)).toHaveLength(3)
    expect(best?.lineup[0]).toEqual({ label: 'Locked 🔒', locked: true })
  })

  it('puts unranked trains last', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = [
      { cluster_id: 'unranked', user_count: 4 },
      { cluster_id: 'ranked', user_count: 2, rank: 9 },
    ]

    expect(trainsOf(snapshot).rows.map((train) => train.id)).toEqual(['ranked', 'unranked'])
  })

  describe('closeness', () => {
    function oneTrain(snapshot: Json, extra: Json = {}) {
      contestOf(snapshot).train_clusters = [
        { cluster_id: 't1', user_count: 19, rank: 16, lineup_signature: 'A|B|C|D|E|F|G|H', ...extra },
      ]
      const [train] = trainsOf(snapshot).rows
      if (!train) throw new Error('Expected a train')
      return train
    }

    it('reads the optional min_shared_slots against the lineup size', () => {
      const train = oneTrain(load(), { min_shared_slots: 6 })

      expect(train.minSharedSlots).toBe(6)
      expect(train.closeness).toEqual({ minShared: 6, slotCount: 8, identical: false })
    })

    it('is identical when every slot is shared', () => {
      expect(oneTrain(load(), { min_shared_slots: 8 }).closeness).toEqual({
        minShared: 8,
        slotCount: 8,
        identical: true,
      })
    })

    it('has no closeness when the producer omits min_shared_slots', () => {
      const train = oneTrain(load())

      expect(train.minSharedSlots).toBeNull()
      expect(train.closeness).toBeNull()
    })

    it('ignores a min_shared_slots that is not a whole number, or that has no lineup to compare with', () => {
      expect(oneTrain(load(), { min_shared_slots: 'six' }).closeness).toBeNull()
      expect(oneTrain(load(), { min_shared_slots: 5.5 }).closeness).toBeNull()
      expect(oneTrain(load(), { min_shared_slots: 6, lineup_signature: '' }).closeness).toBeNull()
    })
  })

  describe('lineup players', () => {
    function lineupOf(signature: string, players: Json[]) {
      const snapshot = load()
      snapshot.sports.cfb.players = players
      contestOf(snapshot).train_clusters = [{ cluster_id: 't1', user_count: 3, rank: 1, lineup_signature: signature }]
      const [train] = trainsOf(snapshot).rows
      return train?.players ?? []
    }

    it('takes each player game status, points and ownership from the pool, matched by name', () => {
      const [live, later, done] = lineupOf('Live Guy|Later Guy|Done Guy', [
        {
          name: 'Live Guy',
          team: 'FSU',
          position: 'QB',
          matchup: 'FSU@MIZZ',
          salary: 1,
          game_status: 'In-Progress',
          fantasy_points: 12.5,
          ownership_pct: 31.5,
          value: 4.5,
        },
        {
          name: 'Later Guy',
          team: 'MIZZ',
          position: 'RB',
          salary: 1,
          game_status: 'FSU@MIZZ 07:30PM ET',
          fantasy_points: 0,
          ownership_pct: 12,
        },
        {
          name: 'Done Guy',
          team: 'FSU',
          position: 'WR',
          salary: 1,
          game_status: 'Final',
          fantasy_points: 30,
          ownership_pct: 55,
          value: 6.5,
        },
      ])

      expect(live).toMatchObject({
        slot: 'QB',
        name: 'Live Guy',
        gameStatus: 'in-progress',
        points: 12.5,
        ownershipPct: 31.5,
        value: 4.5,
        clock: 'In-Progress',
        matchup: 'FSU@MIZZ',
      })
      expect(later).toMatchObject({ slot: 'RB', gameStatus: 'pre-game', points: 0, ownershipPct: 12 })
      expect(done).toMatchObject({ slot: 'WR', gameStatus: 'final', points: 30 })
    })

    it('has no matchup when the pool repeats the game status as the matchup', () => {
      const [live] = lineupOf('Live Guy', [
        {
          name: 'Live Guy',
          team: 'FSU',
          position: 'QB',
          matchup: 'In-Progress',
          salary: 1,
          game_status: 'In-Progress',
        },
      ])

      expect(live.matchup).toBeNull()
    })

    it('keeps a player missing from the pool as a name with no live details', () => {
      const [stranger] = lineupOf('Stranger', [])

      expect(stranger).toMatchObject({
        name: 'Stranger',
        slot: '',
        gameStatus: null,
        points: null,
        ownershipPct: null,
        clock: null,
        matchup: null,
      })
    })

    it('keeps locked slots in position, with no live details', () => {
      const players = lineupOf('LOCKED 🔒|Live Guy', [{ name: 'Live Guy', team: 'FSU', position: 'QB', salary: 1 }])

      expect(players.map((player) => player.name)).toEqual(['Locked 🔒', 'Live Guy'])
      expect(players[0]).toMatchObject({ gameStatus: null, points: null })
    })

    it('has no players for a train without a lineup', () => {
      expect(lineupOf('', [])).toEqual([])
    })
  })

  describe('riding entries', () => {
    it('joins entry_keys to standings rows for display names, in entry_keys order', () => {
      const snapshot = load()
      contestOf(snapshot).standings = [
        { entry_key: 'k2', username: 'second', rank: 2 },
        { entry_key: 'k1', username: 'first', rank: 1 },
      ]
      contestOf(snapshot).train_clusters = [
        { cluster_id: 't1', user_count: 4, rank: 1, entry_keys: ['k1', 'missing', 'k2'] },
      ]

      const [train] = trainsOf(snapshot).rows
      expect(train?.ridingNames).toEqual(['first', 'second'])
    })

    it('has no names when the contest has no standings', () => {
      const snapshot = load()
      delete contestOf(snapshot).standings
      contestOf(snapshot).train_clusters = [{ cluster_id: 't1', user_count: 4, rank: 1, entry_keys: ['k1'] }]

      expect(trainsOf(snapshot).rows[0]?.ridingNames).toEqual([])
    })
  })

  describe('overlap with VIP lineups', () => {
    function overlapSnapshot() {
      const snapshot = load()
      contestOf(snapshot).vip_lineups = [
        {
          entry_key: 'v1',
          display_name: 'VIP One',
          players_live: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((player_name) => ({ slot: 'X', player_name })),
        },
        {
          entry_key: 'v2',
          display_name: 'VIP Two',
          players_live: ['A', 'Z1', 'Z2', 'Z3'].map((player_name) => ({ slot: 'X', player_name })),
        },
      ]
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'big', user_count: 14, rank: 36, lineup_signature: 'A|B|C|D|X1|X2|X3|X4' },
        { cluster_id: 'small', user_count: 2, rank: 4, lineup_signature: 'A|B|C|D|E|F|Q1|Q2' },
      ]
      return snapshot
    }

    it('counts the players each VIP shares with the train, by name', () => {
      const trains = trainsOf(overlapSnapshot()).rows
      const big = trains.find((train) => train.id === 'big')
      const small = trains.find((train) => train.id === 'small')

      expect(big?.vipOverlaps).toEqual([
        { key: 'v1', name: 'VIP One', shared: 4 },
        { key: 'v2', name: 'VIP Two', shared: 1 },
      ])
      expect(small?.vipOverlaps.map((overlap) => overlap.shared)).toEqual([6, 1])
    })

    it('never counts a locked slot as shared', () => {
      const snapshot = overlapSnapshot()
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'locked', user_count: 3, rank: 1, lineup_signature: 'LOCKED 🔒|LOCKED 🔒|A' },
      ]
      contestOf(snapshot).vip_lineups[0].players_live.push({ slot: 'X', player_name: 'LOCKED 🔒', is_locked: true })

      expect(trainsOf(snapshot).rows[0]?.vipOverlaps.map((overlap) => overlap.shared)).toEqual([1, 1])
    })

    it('points each VIP at the train it shares the most players with, with the VIP lineup size', () => {
      const [one, two] = modelOf(overlapSnapshot()).vips

      expect(one?.trainOverlap).toEqual({ trainId: 'small', entries: 2, rank: 4, shared: 6, slotCount: 8 })
      expect(two?.trainOverlap).toBeNull()
    })

    it('breaks ties by the larger train', () => {
      const snapshot = overlapSnapshot()
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'small', user_count: 2, rank: 4, lineup_signature: 'A|B|C|D|E|F|Q1|Q2' },
        { cluster_id: 'big', user_count: 14, rank: 36, lineup_signature: 'A|B|C|D|E|F|Q3|Q4' },
      ]

      expect(modelOf(snapshot).vips[0]?.trainOverlap?.trainId).toBe('big')
    })

    it('has no overlap when a VIP shares fewer than 4 players with every train', () => {
      const snapshot = overlapSnapshot()
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'far', user_count: 9, rank: 1, lineup_signature: 'A|B|C|Y1|Y2|Y3|Y4|Y5' },
      ]

      expect(modelOf(snapshot).vips[0]?.trainOverlap).toBeNull()
    })

    it('has no overlap when trains are unavailable', () => {
      const snapshot = overlapSnapshot()
      delete contestOf(snapshot).train_clusters

      expect(modelOf(snapshot).vips[0]?.trainOverlap).toBeNull()
    })
  })

  describe('largest trains', () => {
    it('orders by entries, then best rank', () => {
      const snapshot = load()
      contestOf(snapshot).train_clusters = [
        { cluster_id: 'a', user_count: 3, rank: 1 },
        { cluster_id: 'b', user_count: 9, rank: 50 },
        { cluster_id: 'c', user_count: 9, rank: 20 },
        { cluster_id: 'd', user_count: 4 },
      ]

      expect(largestTrains(trainsOf(snapshot).rows, 3).map((train) => train.id)).toEqual(['c', 'b', 'd'])
    })
  })

  it('is unavailable when the contest has no train_clusters', () => {
    const snapshot = load()
    delete contestOf(snapshot).train_clusters

    expect(modelOf(snapshot).trains).toEqual({ availability: 'unavailable' })
  })

  it('is empty, not unavailable, when train_clusters is an empty list', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = []

    expect(trainsOf(snapshot).rows).toEqual([])
  })

  it('is unavailable when every train row is malformed', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = [
      null,
      'invalid-row',
      { cluster_id: 123, user_count: 'x' },
      { entry_keys: [42] },
    ]

    expect(modelOf(snapshot).trains).toEqual({ availability: 'unavailable' })
  })

  it('does not accept the pre-v3 train_clusters object shape', () => {
    const snapshot = load()
    contestOf(snapshot).train_clusters = {
      updated_at: '2026-10-03T20:48:31Z',
      clusters: [{ cluster_key: 'old', entry_count: 9 }],
    }

    expect(modelOf(snapshot).trains).toEqual({ availability: 'unavailable' })
  })
})
